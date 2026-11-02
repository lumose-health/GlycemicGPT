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
)


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
    secret = "sk-ecdsa-sha2-nistp256@openssh.com AAAA-test-key"

    with pytest.raises(ValidationError, match="symmetric secret"):
        Settings(_env_file=None, secret_key=secret)


def test_option_prefixed_authorized_key_cannot_be_used_as_jwt_secret() -> None:
    secret = "no-port-forwarding ssh-rsa AAAA-test-key"

    with pytest.raises(ValidationError, match="symmetric secret"):
        Settings(_env_file=None, secret_key=secret)


@pytest.mark.parametrize("key_type", _OPENSSH_KEY_TYPES)
def test_base64_ssh_wire_key_cannot_be_used_as_jwt_secret(key_type: str) -> None:
    key_type_bytes = key_type.encode()
    wire_key = len(key_type_bytes).to_bytes(4, byteorder="big") + key_type_bytes
    secret = b64encode(wire_key).decode()

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
