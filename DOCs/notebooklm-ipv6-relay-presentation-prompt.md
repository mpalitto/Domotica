# NotebookLM prompt — "IPv6 relay for the home LAN"

A ready-to-paste prompt for NotebookLM's **Slide deck** (or *Present*) generator.
The deck explains **why the LAN's IPv6 is a relay** (rather than NAT66 or a
routed subnet) and **how the whole network fits together, IPv4 included**.

---

## Step 1 — add these sources to the notebook

| Source | Why |
|---|---|
| `macos/IPV6-RELAY.md` | Primary: design, invariants, deploy/verify, troubleshooting |
| `macos/README.md` | The Oct 2026 blackhole story, the 1480-byte MTU, the DNS design |
| `AGENTS.md` (section *"Network (LAN, IPv6, DNS)"*) | Topology summary and the constraints |
| `README.md` | What the network serves (automation, RF, eWeLink proxy) — context only |

The prompt below restates the load-bearing facts, so it still works if you only
supply the first two files.

---

## Step 2 — paste this into the slide-deck prompt box

```text
Produce a presentation that explains this home network's IPv6 relay: what it
is, why a relay was chosen over the alternatives, and how the whole network
fits together — IPv4 and IPv6.

AUDIENCE
A technically literate owner/engineer who knows networking basics (IP
addressing, NAT, DHCP, DNS, routing, subnets) but has never seen this network.
Do not assume they know NDP proxying, SLAAC, 464XLAT or prefix delegation —
define each briefly the first time it appears.

TONE
Precise and engineering-honest. Explain WHY before WHAT. Name the trade-offs
and the failure modes that were actually observed. No marketing language, no
hedging, no "best practice" appeals — justify each choice from the constraints.

LENGTH
16–18 slides. Each slide: short title, 3–6 scannable bullets, and a short
speaker-notes paragraph (2–4 sentences) for the detail. Where marked [DIAGRAM],
describe a clean labelled diagram rather than prose.

NARRATIVE ARC
Context → IPv4 as it stands → how IPv6 arrives from the ISP → the Oct 2026
outage → the remaining problem → candidate architectures → why the relay wins →
the design leg by leg → security → how it fails → operating it → lessons.

SLIDE-BY-SLIDE OUTLINE

1. Title: "IPv6 for the home LAN — the relay architecture".
   Subtitle: "Real IPv6. No NAT66. No blackholes."

2. What this network is. Home automation: SONOFF RF switches, ESP8266/ESP32 RF
   receivers, a Linux server (192.168.1.77), an eWeLink proxy (192.168.1.11),
   a Proxmox host (192.168.1.33). One sentence on the stakes: when the network
   misbehaves, lights and phone apps stop responding.

3. The cast of boxes (table): ISP Sky hub 192.168.0.1; router LXC
   192.168.1.1 (Proxmox container "MAIN-router"); LAN 192.168.1.0/24; Proxmox
   host .33 with vmbr0 (LAN) and vmbr1 (USB NIC facing the modem).

4. IPv4 architecture as it stands. [DIAGRAM] Hub (double NAT) → router LXC
   (IPv4 NAT + dnsmasq DHCP/DNS) → LAN. State that IPv4 is untouched by all of
   this work: it is the thing that must keep working.

5. IPv4 subtlety #1 — the 1480-byte path MTU. Sky carries the access over IPv6
   and the hub translates IPv4→IPv6 (464XLAT/CLAT style), swapping a 20-byte
   IPv4 header for a 40-byte IPv6 one: path MTU = 1500 − 20 = 1480, not the
   classic 1500 or 1492. The hub sends no ICMP "frag needed", so oversized
   packets are silently dropped. Therefore a TCPMSS clamp of 1440 on the
   router's FORWARD chain — and why 1452 (the PPPoE-era value) would be wrong.

6. IPv4 subtlety #2 — DNS is doing real work. Clients use the router as
   resolver. The IoT pool (192.168.1.128/26, MACs D0:27:00:*) has its DNS
   redirected from :53 to :1053, where a second dnsmasq answers every query
   with 192.168.1.11 — so SONOFF devices reach the local eWeLink proxy while
   the phone app still works. Flag this: it is the reason the IPv6 design must
   NOT advertise RDNSS later.

7. How IPv6 arrives. The hub sends Router Advertisements carrying exactly one
   on-link /64 (2a0e:437:7b9b::/64) on the modem's segment. There is no prefix
   delegation — nothing else is offered. The router's WAN leg (ether2) is on
   that segment and learns a default route by SLAAC.

8. Why you cannot simply "switch IPv6 on". [DIAGRAM] The same /64 ending up
   on-link on two different segments. Show a LAN client with an address from
   that prefix, a default route pointing at a router that is not forwarding,
   and packets dying silently in between.

9. The Oct 2026 outage. Symptom: Android apps hang on Wi-Fi but work on
   cellular; iOS looks fine. Root cause: radvd on the Proxmox host
   re-advertised the ISP prefix onto the LAN bridge while IPv6 forwarding was
   0 everywhere → every LAN IPv6 packet silently dropped. Explain why Android
   suffered most (IPv6/QUIC with no fallback) and iOS did not (Happy Eyeballs
   falls back to IPv4).

10. The first fix and what it left behind. Disable radvd on the host; add the
    MSS clamp. Result: no IPv6 on the LAN at all. Argue that absent IPv6 is
    SAFE — it fails in milliseconds and clients fall back instantly — whereas
    present-but-dropped IPv6 hangs for the full timeout. "Safe absent" beats
    "present but broken".

11. The design question, stated as constraints. (a) No prefix delegation is
    available. (b) Only one on-link /64 exists, and it is already on the
    modem's segment. (c) IPv4 must not regress. (d) Whatever we build must fail
    back to IPv4, never to a blackhole.

12. Four candidate architectures — comparison table. Rows: (1) do nothing;
    (2) NAT66; (3) routed subnet; (4) NDP relay. Columns: how it works,
    addressing, pros, cons, verdict. Be explicit that option 3 is impossible
    without a delegated prefix and option 1 wastes the IPv6 the ISP already
    provides.

13. Why the relay wins. Ties back to the constraints: it works with no prefix
    delegation; it keeps addresses end-to-end, so there is no NAT66 state or
    port-forwarding equivalent; it keeps exactly one on-link segment per
    prefix; and it degrades safely.

14. The relay, end to end. [DIAGRAM] Modem LAN | router LXC (WAN leg ether2:
    default route only, /64 deliberately kept OFF) | (LAN leg eth0: owns the
    /64, advertises it) | home LAN.

15. The relay, mechanism by mechanism (table). WAN leg: accept_ra=2 and
    accept_ra_defrtr=1 to keep a default route on a forwarding host;
    accept_ra_pinfo=0 to keep the /64 off that leg; forwarding=1 to actually
    relay. LAN leg: accept_ra=0, owns 2a0e:437:7b9b::/64. ndppd with an
    `iface eth0` rule on ether2 — it answers the modem's Neighbour Solicitations
    for LAN hosts with its own MAC, which is what makes return traffic come back.
    radvd on eth0, no RDNSS.

16. Security posture. The hub applies NO inbound IPv6 firewall of its own, so
    the internet could reach SSH, the Proxmox web UI and an open DNS resolver
    over IPv6. Fix: ip6tables INPUT default-DROP on the host and the router
    (allowing only loopback, reply traffic, ICMPv6 and the LAN), and FORWARD
    default-DROP on the router allowing only LAN-initiated traffic and ICMPv6.
    Mention that ICMPv6 is allowed wholesale on purpose — NDP, RAs and
    Packet-Too-Big are mandatory for IPv6 to function. Include the verification
    method: an external IPv6 port checker WITH a known-open control, plus a
    live listener on a LAN host that is reachable on the LAN but unreachable
    from outside.

17. How it fails — the safety design. The agent refuses to advertise unless a
    working default route is present (enabling forwarding makes the kernel drop
    the RA-learned default route, so it solicits a fresh one itself). radvd
    REQUIRES ndppd. The advertised prefix lifetime is 1 hour, so if anything
    dies the LAN falls back to IPv4-only within the hour. Exactly one LAN
    advertiser is allowed; the host's radvd stays disabled and the packaged
    radvd unit stays masked. The theme: every failure path leads back to IPv4,
    never to a blackhole.

18. Operating it, and the lessons. Commands: a status check, a 5-minute timer
    that re-derives the ISP prefix if it changes, and a clean one-command
    rollback. Lessons that generalise: derive the design from the constraints;
    make the failure mode bound the damage; verify from the outside with
    controls, not from the box you just changed; beware kernel behaviours that
    silently drop routes; and "safe absent" is a legitimate target state.

MUST INCLUDE (use these facts exactly; do not invent alternatives)
- IPv6 prefix 2a0e:437:7b9b::/64; there is NO prefix delegation.
- The IPv4 path MTU is 1480, so the TCPMSS clamp is 1440 (not 1452, not 1500).
- The IoT DNS hijack: port 1053 answers 192.168.1.11; it is deliberately
  preserved by NOT advertising RDNSS in the IPv6 router advertisement.
- The Oct 2026 root cause: the same prefix on-link on two segments with
  forwarding off gives a silent drop.
- IPv6 firewall: INPUT DROP and FORWARD DROP, with the specific allowances
  listed above.

MUST NOT CLAIM
- Do not say NAT66 was used — it was considered and rejected.
- Do not say the ISP provides prefix delegation — it does not.
- Do not say the LAN is IPv4-only — it now has real IPv6.
- Do not say the Proxmox host participates in the LAN's IPv6 — it keeps its
  modem-side IPv6 on vmbr1 and is managed over IPv4 on the LAN.

VISUALS
For every [DIAGRAM] slide, describe a clean labelled diagram. Reuse the same
left-to-right layout in all of them — modem segment | router | LAN — and keep
the router drawn identically each time so the slides read as one continuous
story. Render real diagrams, not ASCII art. Use one consistent colour for
"allow" and one for "drop" in the security slide.

SPEAKER NOTES
For each slide add 2–4 sentences of extra detail, including any real symptom or
verification result mentioned above.
```

---

## Optional shorter variant

If you want a 6–8 slide version (e.g. for a family/ops audience), append this
to the prompt:

```text
Reduce to 6–8 slides. Keep only: the cast of boxes, the IPv4 architecture,
the Oct 2026 outage and its lesson, the four-option comparison, the relay
architecture diagram, the security posture, and how it fails. Drop the
mechanism-level detail and the operating commands.
```
