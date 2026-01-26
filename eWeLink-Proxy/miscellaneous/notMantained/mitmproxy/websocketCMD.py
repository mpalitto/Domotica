import asyncio
import mitmproxy.websocket
from mitmproxy import ctx
import mitmproxy.addonmanager
import json


class InjectWebSocketMessage:
    # ... (Previous class definition remains the same)

    ONOFFmessage = '{"action":"update","deviceid":"XXXXXXX","apikey":"57f28e88-bc59-44b3-a68e-7bc7fc93009c","userAgent":"app","sequence":"1547399826967","ts":0,"params":{"switch":"YYYYYYY"},"from":"app"}'
    msg = ''

    OFFmessage = '{"action":"update","deviceid":"100003ac56","apikey":"57f28e88-bc59-44b3-a68e-7bc7fc93009c","userAgent":"app","sequence":"1547399917830","ts":0,"params":{"switch":"off"},"from":"app"}'

    sONOFF = {}  # name: flow, ID: name
    sONOFFflow = {}  # name: ID
    sONOFFlist = {} # list of named devices by user

    def inject(flow: mitmproxy.websocket.WebSocketFlow): #inject a WebSocket message to the client
        ctx.log.info(flow)
        print(flow.messages[-1])
        flow.inject_message(flow.client_conn, InjectWebSocketMessage.msg)
        # to_client = True
        # ctx.master.commands.call("inject.websocket", flow, to_client, InjectWebSocketMessage.msg, True)

    # def websocket_start(self, flow): # Every new WebSocket connection
        
    # logs websockets messages on file
    def websocket_message(self, flow):
        # get the latest message
        message = flow.messages[-1]
        msg = json.loads(message.content)
        f = open("/root/websocket.log", "a+")
        f.write(message.content + "\n")
        f.close()
        devID = msg["deviceid"]
        ctx.log.info(devID + " DETECTED!")
        if self.sONOFFlist[devID]:
            devName = self.sONOFFlist[devID]
            if not devName in self.sONOFFflow:
                self.sONOFFflow[devName] = flow
                self.sONOFF[devName] = devID
        else:
            if not devID in self.sONOFF:
                self.sONOFF[devID] = "???"
                f = open("/root/sONOFF.list", "a+")
                f.write("name " + devID + " ???\n")
                f.close()
        ctx.log.info(self.sONOFF)
        ctx.log.info(self.sONOFFflow)

    class HandleCMD(asyncio.Protocol):

        def sONOFFcmd(self, command):
            cmd = command.split()
            self.transport.write("cmd[0]: ".encode())
            self.transport.write(cmd[0].encode())
            self.transport.write("\n".encode())

            if len(cmd) < 2:
                ctx.log.info("Incomplete command syntax")
                return

            if cmd[0] == "name":
                if len(cmd) != 3:
                    ctx.log.info("Syntax: name devID devName")
                    return
                InjectWebSocketMessage.sONOFF[cmd[1]] = cmd[2]
                InjectWebSocketMessage.sONOFFid[cmd[2]] = cmd[1]

            elif cmd[0] == "switch":
                self.transport.write("cmd[1]: ".encode())
                self.transport.write(cmd[1].encode())
                self.transport.write(" | sONOFF: ".encode())
                self.transport.write(json.dumps(InjectWebSocketMessage.sONOFF).encode())
                self.transport.write("\n".encode())
                
                devName = cmd[1]
                if devName in InjectWebSocketMessage.sONOFF:
                    self.transport.write("found device online".encode())
                    self.transport.write("\n".encode())
                    if len(cmd) != 3 or cmd[2] not in ["ON", "OFF"]:
                        ctx.log.info("Syntax: switch deviceName ON|OFF")
                        return

                    InjectWebSocketMessage.msg = InjectWebSocketMessage.ONOFFmessage.replace("XXXXXXX", InjectWebSocketMessage.sONOFF[cmd[1]])
                    if cmd[2] == "ON":
                        InjectWebSocketMessage.msg = InjectWebSocketMessage.msg.replace("YYYYYYY", "on")
                    elif cmd[2] == "OFF":
                        InjectWebSocketMessage.msg = InjectWebSocketMessage.msg.replace("YYYYYYY", "off")
                    else:
                        return
                    self.transport.write("injecting message: ".encode())
                    self.transport.write(InjectWebSocketMessage.msg.encode())
                    # self.transport.write(" | sONOFFflow: ".encode())
                    # self.transport.write(json.dumps(InjectWebSocketMessage.sONOFFflow).encode())
                    self.transport.write("\n".encode())
                    ctx.log.info(InjectWebSocketMessage.sONOFFflow[devName])
                    # InjectWebSocketMessage.inject(InjectWebSocketMessage.sONOFFflow[devName], msg)
                    # Inject the message into the WebSocket flow
                    InjectWebSocketMessage.inject(InjectWebSocketMessage.sONOFFflow[devName])
            
            else:
                ctx.log.info("Command not recognized or invalid syntax")

        def connection_made(self, transport):
            peername = transport.get_extra_info("peername")
            print("Connection from {}".format(peername))
            self.transport = transport

        def data_received(self, data):
            message = data.decode()

            if message.strip() == "q":
                print("BYE... Close the client socket")
                self.transport.write("BYE... Close the client socket".encode())
                self.transport.close()
                asyncio.create_task(stop_server())  # Create a task to stop the server
                return

            if message.strip() == "?":  # Command to list available commands
                self.transport.write(
                    "Available commands: \n"
                    "name devID devName\n"
                    "switch deviceName ON|OFF\n".encode()
                )
                return

            if message.strip() == "list": # list online switches(device)
                self.transport.write("online switch list:\n".encode())
                for key, value in self.sONOFF.items():
                    device = f"{key}: {value}\n"
                    self.transport.write(device.encode())
                return

            print("Data received: {!r}".format(message))
            print("Send: {!r}".format(message))
            self.transport.write(data)
            self.sONOFFcmd(message)

        def connection_lost(self, exc):
            print("The connection is closed")

    async def stop_server():
        server.close()
        await server.wait_closed()

    async def start_server(self):
        global server
        loop = asyncio.get_event_loop()
        server = await loop.create_server(lambda: self.HandleCMD(), "127.0.0.1", 8888)

        try:
            # Assuming server is now a global variable
            await server.wait_closed()  # Keep the server running until explicitly closed
        except asyncio.CancelledError:
            pass


    def load(self, entry):

        # Create an instance of HandleCMD
        # handler = self.HandleCMD()

        try:
            # get devices name from configuration file
            with open("/root/sONOFF.list", "r") as f:
                for line in f:
                    self.sONOFFlist[line.split()[1]] = line.split()[2]  # modify the list to keep only the device name
            f.close()
            ctx.log.info(f"List devices name: {self.sONOFFlist}")

            from datetime import datetime

            # Open a new websocket.log file in write mode ('w')
            with open("/root/websocket.log", "w") as file:
                current_datetime = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                file.write(f"Recording Session: {current_datetime}\n")
                file.write(f"sONOFF: \n")
                # file.write(self.sONOFF)
                file.write(f"\n")
                file.close()

            # Start the server
            asyncio.ensure_future(self.start_server())

            ctx.log.info("ADDON loaded")

        except Exception as e:
            # Assuming ctx is defined somewhere else in your code
            ctx.log.error(f"Error loading addon: {e}")
            pass  # Handle the exception as per your requirement


addons = [InjectWebSocketMessage()]
