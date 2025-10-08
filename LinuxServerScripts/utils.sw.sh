function on() {
  grep on switches.status | while read id st; do sed -n "/$id/{p}" sONOFF.deviceid; done
}
