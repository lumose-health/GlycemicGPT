"""JWT configuration invariants required by the python-jose risk boundary."""

from base64 import b64encode, urlsafe_b64encode
from datetime import UTC, datetime, timedelta
from secrets import token_bytes, token_hex

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from cryptography.x509.oid import NameOID
from pydantic import ValidationError

from src.config import Settings

_OPENSSH_KEY_TYPES = (
    "ssh-rsa",
    "ssh-dss",
    "ssh-ed25519",
    "ssh-ed448",
    "ecdsa-sha2-nistp256",
    "ecdsa-sha2-nistp384",
    "ecdsa-sha2-nistp521",
    "sk-ecdsa-sha2-nistp256@openssh.com",
    "sk-ssh-ed25519@openssh.com",
    "ssh-rsa-cert-v01@openssh.com",
    "ssh-dss-cert-v01@openssh.com",
    "ssh-ed25519-cert-v01@openssh.com",
    "ssh-ed448-cert-v01@openssh.com",
    "ecdsa-sha2-nistp256-cert-v01@openssh.com",
    "ecdsa-sha2-nistp384-cert-v01@openssh.com",
    "ecdsa-sha2-nistp521-cert-v01@openssh.com",
    "sk-ecdsa-sha2-nistp256-cert-v01@openssh.com",
    "sk-ssh-ed25519-cert-v01@openssh.com",
    "ssh-xmss@openssh.com",
    "ssh-xmss-cert-v01@openssh.com",
    "x509v3-future-key",
    "future-key@openssh.com",
)


def _ssh_wire_key(key_type: str) -> bytes:
    key_type_bytes = key_type.encode()
    return len(key_type_bytes).to_bytes(4, byteorder="big") + key_type_bytes


def _authorized_key(key_type: str, *, options: str | None = None) -> str:
    record = f"{key_type} {b64encode(_ssh_wire_key(key_type)).decode()}"
    return f"{options} {record}" if options else record


def _private_key() -> rsa.RSAPrivateKey:
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def _public_key() -> rsa.RSAPublicKey:
    return _private_key().public_key()


def _certificate() -> x509.Certificate:
    key = _private_key()
    subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "jwt-config-test")])
    now = datetime.now(UTC)
    return (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(minutes=1))
        .not_valid_after(now + timedelta(minutes=1))
        .sign(key, hashes.SHA256())
    )


def test_jwt_algorithm_is_fixed_to_hs256() -> None:
    with pytest.raises(ValidationError, match="HS256"):
        Settings(_env_file=None, jwt_algorithm="RS256")


@pytest.mark.parametrize("encoding", [Encoding.PEM, Encoding.DER])
def test_asymmetric_public_key_cannot_be_used_as_jwt_secret(
    encoding: Encoding,
) -> None:
    key_bytes = _public_key().public_bytes(
        encoding=encoding,
        format=PublicFormat.SubjectPublicKeyInfo,
    )
    secret = (
        key_bytes.decode()
        if encoding is Encoding.PEM
        else b64encode(key_bytes).decode()
    )

    with pytest.raises(ValidationError, match="symmetric secret"):
        Settings(_env_file=None, secret_key=secret)


@pytest.mark.parametrize("encoding", [Encoding.PEM, Encoding.DER])
def test_x509_certificate_cannot_be_used_as_jwt_secret(encoding: Encoding) -> None:
    certificate = _certificate().public_bytes(encoding)
    secret = (
        certificate.decode()
        if encoding is Encoding.PEM
        else b64encode(certificate).decode()
    )

    with pytest.raises(ValidationError, match="symmetric secret"):
        Settings(_env_file=None, secret_key=secret)


def test_base64url_der_public_key_cannot_be_used_as_jwt_secret() -> None:
    key_bytes = _public_key().public_bytes(
        encoding=Encoding.DER,
        format=PublicFormat.SubjectPublicKeyInfo,
    )
    secret = urlsafe_b64encode(key_bytes).rstrip(b"=").decode()

    with pytest.raises(ValidationError, match="symmetric secret"):
        Settings(_env_file=None, secret_key=secret)


def test_base64_encoded_pem_public_key_cannot_be_used_as_jwt_secret() -> None:
    key_bytes = _public_key().public_bytes(
        encoding=Encoding.PEM,
        format=PublicFormat.SubjectPublicKeyInfo,
    )
    secret = b64encode(key_bytes).decode()

    with pytest.raises(ValidationError, match="symmetric secret"):
        Settings(_env_file=None, secret_key=secret)


def test_base64_encoded_openssh_public_key_cannot_be_used_as_jwt_secret() -> None:
    key_bytes = _public_key().public_bytes(
        encoding=Encoding.OpenSSH,
        format=PublicFormat.OpenSSH,
    )
    secret = b64encode(key_bytes).decode()

    with pytest.raises(ValidationError, match="symmetric secret"):
        Settings(_env_file=None, secret_key=secret)


def test_security_key_openssh_public_key_cannot_be_used_as_jwt_secret() -> None:
    secret = _authorized_key("sk-ecdsa-sha2-nistp256@openssh.com")

    with pytest.raises(ValidationError, match="symmetric secret"):
        Settings(_env_file=None, secret_key=secret)


def test_option_prefixed_authorized_key_cannot_be_used_as_jwt_secret() -> None:
    secret = _authorized_key("ssh-rsa", options="no-port-forwarding")

    with pytest.raises(ValidationError, match="symmetric secret"):
        Settings(_env_file=None, secret_key=secret)


@pytest.mark.parametrize("key_type", _OPENSSH_KEY_TYPES)
def test_base64_ssh_wire_key_cannot_be_used_as_jwt_secret(key_type: str) -> None:
    secret = b64encode(_ssh_wire_key(key_type)).decode()

    with pytest.raises(ValidationError, match="symmetric secret"):
        Settings(_env_file=None, secret_key=secret)


@pytest.mark.parametrize(
    "marker",
    [
        b"---- BEGIN SSH2 PUBLIC KEY ----",
        b"-----BEGIN PUBLIC KEY-----",
    ],
    ids=["rfc4716", "pem"],
)
@pytest.mark.parametrize("base64_encoded", [False, True], ids=["raw", "base64"])
def test_embedded_key_block_marker_cannot_be_used_as_jwt_secret(
    marker: bytes, base64_encoded: bool
) -> None:
    key_block = b"metadata before marker\n" + marker + b"\nAAAA-test-key"
    secret = b64encode(key_block).decode() if base64_encoded else key_block.decode()

    with pytest.raises(ValidationError, match="symmetric secret"):
        Settings(_env_file=None, secret_key=secret)


def test_base64_encoded_pem_certificate_cannot_be_used_as_jwt_secret() -> None:
    secret = b64encode(_certificate().public_bytes(Encoding.PEM)).decode()

    with pytest.raises(ValidationError, match="symmetric secret"):
        Settings(_env_file=None, secret_key=secret)


def test_base64_symmetric_jwt_secret_remains_valid() -> None:
    secret = b64encode(token_bytes(32)).decode()

    assert Settings(_env_file=None, secret_key=secret).secret_key == secret


def test_random_64_character_jwt_secret_remains_valid() -> None:
    secret = token_hex(32)

    assert len(secret) == 64
    assert Settings(_env_file=None, secret_key=secret).secret_key == secret


def test_key_type_prefixed_symmetric_jwt_secret_remains_valid() -> None:
    secret = f"sk-{token_hex(32)}"

    assert Settings(_env_file=None, secret_key=secret).secret_key == secret
