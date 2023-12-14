import asyncio

class HandleCMD(asyncio.Protocol):
    def connection_made(self, transport):
        peername = transport.get_extra_info('peername')
        print('Connection from {}'.format(peername))
        self.transport = transport

    def data_received(self, data):
        message = data.decode()

        if message.strip() == 'q':
            print('BYE... Close the client socket')
            self.transport.write('BYE... Close the client socket'.encode())
            self.transport.close()
            asyncio.create_task(server_stop())  # Create a task to stop the server
            return

        print('Data received: {!r}'.format(message))
        print('Send: {!r}'.format(message))
        self.transport.write(data)

    def connection_lost(self, exc):
        print('The connection is closed')

async def server_stop():
    server.close()
    await server.wait_closed()

async def main():
    loop = asyncio.get_running_loop()
    global server
    server = await loop.create_server(
        lambda: HandleCMD(),
        '127.0.0.1', 8888)

    try:
        async with server:
            await server.serve_forever()
    except asyncio.CancelledError:
        pass

asyncio.run(main())
