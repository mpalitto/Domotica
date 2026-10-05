import sys, json
d = json.load(sys.stdin)
dead = [x.get("alias", "?") for x in d if x.get("localOnline") is False and x.get("cloudOnline") is False]
off = [x.get("alias", "?") for x in d if x.get("localOnline") is False and x.get("cloudOnline") is True]
print("DEAD " + " ".join(dead))
print("OFF " + " ".join(off))