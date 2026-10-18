import ipaddress
import socket
import sys
from collections.abc import Iterator
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "launcher"))

import launcher  # noqa: E402


@pytest.fixture
def listening_socket() -> Iterator[int]:
    """Un puerto ocupado por un socket en escucha durante la prueba."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        sock.listen()
        yield sock.getsockname()[1]


def test_parse_args_recognizes_all_flags() -> None:
    args = launcher.parse_args(
        [
            "--no-browser",
            "--port",
            "9000",
            "--lan",
            "--data-dir",
            "C:/datos",
            "--reset-admin",
            "--email",
            "ana@sonardespierto.org",
        ]
    )
    assert args.no_browser is True
    assert args.port == 9000
    assert args.lan is True
    assert args.data_dir == "C:/datos"
    assert args.reset_admin is True
    assert args.email == "ana@sonardespierto.org"


def test_parse_args_defaults() -> None:
    args = launcher.parse_args([])
    assert (args.no_browser, args.port, args.lan, args.data_dir, args.reset_admin) == (
        False,
        None,
        False,
        None,
        False,
    )


def test_write_default_config_creates_once(tmp_path: Path) -> None:
    assert launcher.write_default_config(tmp_path) is True
    config = tmp_path / "config.env"
    assert "LAN_MODE=false" in config.read_text(encoding="utf-8")

    config.write_text("PORT=9999\n", encoding="utf-8")  # cambio del usuario
    assert launcher.write_default_config(tmp_path) is False
    assert config.read_text(encoding="utf-8") == "PORT=9999\n"


def test_port_is_free_detects_busy_port(listening_socket: int) -> None:
    assert launcher.port_is_free("127.0.0.1", listening_socket) is False


def test_find_free_port_skips_busy_port(listening_socket: int) -> None:
    port = launcher.find_free_port("127.0.0.1", listening_socket, span=20)
    assert port != listening_socket
    assert listening_socket < port < listening_socket + 20
    assert launcher.port_is_free("127.0.0.1", port)


def test_find_free_port_raises_when_none(listening_socket: int) -> None:
    with pytest.raises(RuntimeError):
        launcher.find_free_port("127.0.0.1", listening_socket, span=1)


def test_lan_ipv4_addresses_are_valid_and_not_loopback() -> None:
    addresses = launcher.lan_ipv4_addresses()
    assert len(addresses) == len(set(addresses))
    for address in addresses:
        ip = ipaddress.IPv4Address(address)
        assert not address.startswith("127.")
        assert not ip.is_unspecified


def test_is_our_instance_false_on_free_port() -> None:
    free_port = launcher.find_free_port("127.0.0.1", 8900)
    assert launcher.is_our_instance(free_port) is False


def test_banner_without_lan(capsys: pytest.CaptureFixture[str], tmp_path: Path) -> None:
    launcher.print_banner("http://localhost:8765", [], tmp_path, "0.1.0")
    out = capsys.readouterr().out
    assert "Soñar Despierto — Sistema de Gestión  v0.1.0" in out
    assert "http://localhost:8765" in out
    assert "desactivado (LAN_MODE=false en config.env)" in out
    assert str(tmp_path) in out


def test_banner_with_lan(capsys: pytest.CaptureFixture[str], tmp_path: Path) -> None:
    launcher.print_banner("http://localhost:8765", ["http://192.168.1.25:8765"], tmp_path, "0.1.0")
    out = capsys.readouterr().out
    assert "Desde otras PCs de la red:" in out
    assert "http://192.168.1.25:8765" in out
