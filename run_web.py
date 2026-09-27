"""Run the local UI on both IPv4 and IPv6 localhost addresses."""

import argparse
import asyncio
import socket

import uvicorn

from web_app import app


def listen(family: socket.AddressFamily, address: tuple) -> socket.socket:
    sock = socket.socket(family, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    if family == socket.AF_INET6:
        sock.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
    sock.bind(address)
    sock.listen(2048)
    sock.setblocking(False)
    return sock


def main() -> None:
    parser = argparse.ArgumentParser(description="Qwen Video Desk local web server")
    parser.add_argument("--port", type=int, default=7860)
    args = parser.parse_args()

    sockets = []
    try:
        sockets.append(listen(socket.AF_INET, ("127.0.0.1", args.port)))
        sockets.append(listen(socket.AF_INET6, ("::1", args.port)))
        server = uvicorn.Server(uvicorn.Config(app, host="localhost", port=args.port))
        asyncio.run(server.serve(sockets=sockets))
    finally:
        for sock in sockets:
            sock.close()


if __name__ == "__main__":
    main()
