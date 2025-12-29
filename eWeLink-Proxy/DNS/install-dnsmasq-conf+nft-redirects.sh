cp dnsmasq.conf /etc/dnsmasq.conf
cp dnsmasq-redirect.conf /etc/dnsmasq-redirect.conf
cp dnsmasq-redirect.service /etc/systemd/system/dnsmasq-redirect.service

# Enable and start services
sudo systemctl restart dnsmasq
sudo systemctl enable --now dnsmasq-redirect

./nft-redirects.sh migrate

systemctl stop netfilter-persistent
systemctl disable netfilter-persistent
# Clear NAT table rules
sudo iptables -t nat -F

# Clear Filter table rules
sudo iptables -F

# Delete any custom chains
sudo iptables -X
