tail -f switches.log | \
while read deviceid status
do
  echo $deviceid $status
#   # sed "/^$deviceid/{h;s/ .*/ $status/};${x;/^$/{s//$deviceid $status/;H};x}" switches.status
done

