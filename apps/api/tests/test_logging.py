"""Story 1.5: Tests for structured logging configuration."""

import json
import logging

import pytest

from src.logging_config import (
    JsonFormatter,
    TextFormatter,
    correlation_id_ctx,
    get_logger,
    setup_logging,
)

# Third-party loggers setup_logging turns down. Spelled out here rather than
# imported so a rename in either place shows up as a test failure.
_MUTED_THIRD_PARTY_LOGGERS = (
    "uvicorn.access",
    "sqlalchemy.engine",
    "tconnectsync.api.tandemsource",
)


class _RecordCollector(logging.Handler):
    """Collects records that survive the handler chain setup_logging installs.

    caplog is no use for these assertions: setup_logging clears the root
    handlers, taking pytest's capture handler with them, so caplog.records
    would be empty whether or not the logger under test was muted.
    """

    def __init__(self) -> None:
        super().__init__(level=logging.DEBUG)
        self.records: list[logging.LogRecord] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(record)

    @property
    def messages(self) -> list[str]:
        return [record.getMessage() for record in self.records]


class TestJsonFormatter:
    """Tests for JSON log formatting."""

    def test_json_format_basic(self):
        """Test basic JSON log format."""
        formatter = JsonFormatter(service_name="test-service")
        record = logging.LogRecord(
            name="test.logger",
            level=logging.INFO,
            pathname="test.py",
            lineno=10,
            msg="Test message",
            args=(),
            exc_info=None,
        )

        output = formatter.format(record)
        parsed = json.loads(output)

        assert parsed["level"] == "INFO"
        assert parsed["service"] == "test-service"
        assert parsed["message"] == "Test message"
        assert parsed["logger"] == "test.logger"
        assert "timestamp" in parsed

    def test_json_format_with_correlation_id(self):
        """Test JSON format includes correlation ID when set."""
        formatter = JsonFormatter()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="",
            lineno=0,
            msg="Test",
            args=(),
            exc_info=None,
        )

        # Set correlation ID
        token = correlation_id_ctx.set("test-correlation-123")
        try:
            output = formatter.format(record)
            parsed = json.loads(output)
            assert parsed["correlation_id"] == "test-correlation-123"
        finally:
            correlation_id_ctx.reset(token)

    def test_json_format_without_correlation_id(self):
        """Test JSON format works without correlation ID."""
        formatter = JsonFormatter()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="",
            lineno=0,
            msg="Test",
            args=(),
            exc_info=None,
        )

        output = formatter.format(record)
        parsed = json.loads(output)
        assert "correlation_id" not in parsed

    def test_json_format_error_includes_location(self):
        """Test that ERROR level logs include location info."""
        formatter = JsonFormatter()
        record = logging.LogRecord(
            name="test",
            level=logging.ERROR,
            pathname="/app/test.py",
            lineno=42,
            msg="Error occurred",
            args=(),
            exc_info=None,
        )
        record.funcName = "test_function"

        output = formatter.format(record)
        parsed = json.loads(output)

        assert "location" in parsed
        assert parsed["location"]["file"] == "/app/test.py"
        assert parsed["location"]["line"] == 42
        assert parsed["location"]["function"] == "test_function"

    def test_json_format_with_exception(self):
        """Test JSON format includes exception info."""
        formatter = JsonFormatter()

        try:
            raise ValueError("Test error")
        except ValueError:
            import sys

            exc_info = sys.exc_info()

        record = logging.LogRecord(
            name="test",
            level=logging.ERROR,
            pathname="",
            lineno=0,
            msg="Error",
            args=(),
            exc_info=exc_info,
        )

        output = formatter.format(record)
        parsed = json.loads(output)

        assert "exception" in parsed
        assert "ValueError" in parsed["exception"]


class TestTextFormatter:
    """Tests for text log formatting."""

    def test_text_format_basic(self):
        """Test basic text log format."""
        formatter = TextFormatter(service_name="test-service")
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="",
            lineno=0,
            msg="Test message",
            args=(),
            exc_info=None,
        )

        output = formatter.format(record)

        assert "test-service" in output
        assert "INFO" in output
        assert "Test message" in output

    def test_text_format_with_correlation_id(self):
        """Test text format includes correlation ID."""
        formatter = TextFormatter()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="",
            lineno=0,
            msg="Test",
            args=(),
            exc_info=None,
        )

        token = correlation_id_ctx.set("abc-123")
        try:
            output = formatter.format(record)
            assert "[abc-123]" in output
        finally:
            correlation_id_ctx.reset(token)


class TestStructuredLogger:
    """Tests for StructuredLogger wrapper."""

    def test_logger_info(self, caplog):
        """Test structured logger info method."""
        logger = get_logger("test.logger")

        with caplog.at_level(logging.INFO):
            logger.info("Test info message")

        assert "Test info message" in caplog.text

    def test_logger_error(self, caplog):
        """Test structured logger error method."""
        logger = get_logger("test.logger")

        with caplog.at_level(logging.ERROR):
            logger.error("Test error message")

        assert "Test error message" in caplog.text

    def test_logger_with_extra_fields(self):
        """Test logger with extra fields (for JSON formatter)."""
        # This test verifies the method accepts extra fields
        logger = get_logger("test")
        # Should not raise any errors
        logger.info("Test message", user_id="123", action="login")


class TestSetupLogging:
    """Tests for logging setup function."""

    @pytest.fixture(autouse=True)
    def _restore_logging_state(self):
        """setup_logging mutates process-wide logging; put it back afterwards.

        Without this, the muted third-party level leaks into every later test
        in the session and makes their log assertions order-dependent.
        """
        root = logging.getLogger()
        muted = [logging.getLogger(name) for name in _MUTED_THIRD_PARTY_LOGGERS]
        saved_handlers = root.handlers[:]
        saved_root_level = root.level
        saved_levels = [logger.level for logger in muted]
        try:
            yield
        finally:
            root.handlers[:] = saved_handlers
            root.setLevel(saved_root_level)
            for logger, level in zip(muted, saved_levels, strict=True):
                logger.setLevel(level)

    def test_setup_json_logging(self):
        """Test setup_logging with JSON format."""
        setup_logging(log_format="json", log_level="DEBUG")

        root = logging.getLogger()
        assert root.level == logging.DEBUG
        assert len(root.handlers) == 1
        assert isinstance(root.handlers[0].formatter, JsonFormatter)

    def test_setup_text_logging(self):
        """Test setup_logging with text format."""
        setup_logging(log_format="text", log_level="INFO")

        root = logging.getLogger()
        assert len(root.handlers) == 1
        assert isinstance(root.handlers[0].formatter, TextFormatter)

    def test_setup_custom_service_name(self):
        """Test setup_logging with custom service name."""
        setup_logging(log_format="json", service_name="custom-service")

        root = logging.getLogger()
        formatter = root.handlers[0].formatter
        assert isinstance(formatter, JsonFormatter)
        assert formatter.service_name == "custom-service"

    @staticmethod
    def _collect_configured_output() -> _RecordCollector:
        """Attach a collector to the root logger setup_logging just configured."""
        collector = _RecordCollector()
        logging.getLogger().addHandler(collector)
        return collector

    def test_tandem_jwt_dump_is_not_logged(self):
        """The library's decoded-JWT line must not reach our log stream.

        tconnectsync.api.tandemsource logs the decoded JWT (email, name,
        accountId, pumperId) at INFO and the raw id_token at DEBUG. Asserted by
        emitting the real line shapes rather than by reading the level back, so
        any equally-effective mute keeps passing.
        """
        setup_logging(log_format="json", log_level="DEBUG")
        collected = self._collect_configured_output()
        library_logger = logging.getLogger("tconnectsync.api.tandemsource")

        library_logger.info(
            'Decoded JWT: {"email": "someone@example.invalid", '
            '"pumperId": "12345", "accountId": "67890"}'
        )
        library_logger.debug("6. extracting JWT from eyJhbGciOiJSUzI1NiJ9.fake")

        assert collected.messages == []

    def test_tconnectsync_signals_still_propagate(self):
        """Muting is scoped to one module's noisy levels, not the whole library."""
        setup_logging(log_format="json", log_level="DEBUG")
        collected = self._collect_configured_output()

        logging.getLogger("tconnectsync.api.tandemsource").warning(
            "Received ApiException in TandemSourceApi"
        )
        # A sibling module keeps its DEBUG diagnostics -- that is what a
        # pump-log parse failure is triaged with.
        logging.getLogger("tconnectsync.eventparser.generic").debug(
            "UNKNOWN_EVENT | id=999"
        )

        assert collected.messages == [
            "Received ApiException in TandemSourceApi",
            "UNKNOWN_EVENT | id=999",
        ]
