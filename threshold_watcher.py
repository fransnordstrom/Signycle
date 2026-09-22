#!/usr/bin/env python3
"""
Signycle threshold-trigger post generator.

Usage: run this AFTER updating signals-data.json with a new value.
It compares the OLD zone (passed in) against the NEW zone (read from
signals-data.json) for a given signal. If the zone changed -- i.e. a
BUY or SELL threshold was actually crossed -- it builds a LinkedIn
post draft using the real price log pulled from hormuz-dashboard.html
(or any other source of historical values you give it).

This does NOT post anything automatically. It only decides whether a
post is warranted and drafts it, so a human always reviews before
anything goes to LinkedIn.
"""
import json
import re
import sys

def check_threshold_event(signal_key, old_zone, price_log_lines=None):
    """
    signal_key: e.g. 'brent', 'gold'
    old_zone: the zone BEFORE this update, e.g. 'neutral'
    price_log_lines: optional list of (date, value) tuples for the draft's evidence trail
    Returns: dict with event info if triggered, else None
    """
    d = json.load(open('signals-data.json'))
    s = d['signals'][signal_key]
    new_zone = s['zone']
    value = s['value']
    date = s['date']

    if new_zone == old_zone:
        return None  # no threshold crossed -- nothing to draft

    return {
        'signal': signal_key,
        'old_zone': old_zone,
        'new_zone': new_zone,
        'value': value,
        'date': date,
        'price_log': price_log_lines or [],
    }

def extract_price_log(signal_key='brent', max_points=8):
    """Pull the recent price history for a signal straight from the
    Hormuz timeline, so the draft always has real evidence attached."""
    try:
        c = open('hormuz-dashboard.html', encoding='utf-8').read()
    except FileNotFoundError:
        return []
    events = re.findall(r'<span class="tl-event"[^>]*>([^<]*)</span>', c)
    log = []
    for e in events:
        # match "23 Jul" style dates with a $NN(.NN) price mentioned in the same event
        date_m = re.match(r'([\d]{1,2}\s\w{3}(?:\s\(\w+\))?)', e.strip())
        price_m = re.search(r'\$(\d{2,3}(?:\.\d+)?)', e)
        if date_m and price_m and signal_key == 'brent':
            log.append((date_m.group(1), price_m.group(1)))
    return log[-max_points:]

def draft_post(event):
    sig = event['signal'].upper()
    direction = event['new_zone'].upper()
    log_str = ' → '.join(f"${v} ({d})" for d, v in event['price_log']) if event['price_log'] else '[insert price log]'

    draft = f"""
--- LINKEDIN POST DRAFT (threshold event) ---

My {event['signal']} signal just triggered {direction} for the first time in this cycle.

{event['signal'].capitalize()} is now ${event['value']} as of {event['date']}.

Price log leading here:
{log_str}

[Fill in: what changed, what the threshold means, honest caveat that a
{direction} reading is a statement about price relative to history --
not a forecast.]

*I track 18 commodity and macro signals against historical thresholds
at Signycle.com. Not financial advice.*

--- END DRAFT ---
"""
    return draft

if __name__ == '__main__':
    # Example manual invocation -- in practice I (Claude) call check_threshold_event()
    # right after writing a new value to signals-data.json, using the zone
    # the signal had BEFORE this specific update.
    signal = sys.argv[1] if len(sys.argv) > 1 else 'brent'
    old_zone = sys.argv[2] if len(sys.argv) > 2 else 'neutral'
    event = check_threshold_event(signal, old_zone)
    if event:
        event['price_log'] = [(d, v) for d, v in extract_price_log(signal)]
        print(draft_post(event))
    else:
        print(f"No threshold change for {signal}. No post needed.")
