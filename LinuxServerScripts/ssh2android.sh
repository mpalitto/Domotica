screen -S android -d -m
screen -S android -X stuff "ssh -oHostKeyAlgorithms=+ssh-dss anonymous@192.168.1.164 -p 2222\n"
sleep 2
screen -S android -X stuff "\n"
