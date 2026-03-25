#!/usr/bin/env python3
"""학생맞춤통합지원 웹앱 로컬 서버 실행 스크립트.

- 기본 포트: 8000
- 0.0.0.0 바인딩으로 같은 인트라넷에서 접속 가능
"""

from __future__ import annotations

import argparse
import http.server
import os
import socket
import socketserver


def get_local_ip() -> str:
    """현재 PC의 인트라넷 IP를 최대한 안정적으로 가져온다."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        sock.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="학생맞춤통합지원 웹앱 서버")
    parser.add_argument("--port", type=int, default=8000, help="서버 포트 (기본값: 8000)")
    return parser.parse_args()


def run_server(port: int) -> None:
    handler = http.server.SimpleHTTPRequestHandler
    local_ip = get_local_ip()

    class ReusableTCPServer(socketserver.TCPServer):
        allow_reuse_address = True

    with ReusableTCPServer(("0.0.0.0", port), handler) as httpd:
        print("=" * 64)
        print("학생맞춤통합지원 웹앱 서버가 실행되었습니다.")
        print(f"- 이 PC 접속 주소: http://localhost:{port}")
        print(f"- 인트라넷 접속 주소: http://{local_ip}:{port}")
        print("- 같은 학교 네트워크(와이파이/유선) 사용자들이 접속할 수 있습니다.")
        print("- 종료하려면 Ctrl + C 를 누르세요.")
        print("=" * 64)
        httpd.serve_forever()


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    args = parse_args()
    run_server(args.port)
