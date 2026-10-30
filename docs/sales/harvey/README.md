# Harvey training for Autowebly

[Harvey](https://github.com/ethanplusai/harvey) trained on the Autowebly site (home, B2B lead
generation and blog pages). These files are its output, kept here so they survive a fresh setup.

| File | What it is |
| --- | --- |
| `harvey.local.yaml` | Product, ideal customer, persona and sending settings Harvey learned |
| `skills/product_knowledge.md` | What Harvey knows about Autowebly's services |
| `skills/competitive_intel.md` | Competitors and how to position against them |
| `train_offline.py` | Trains from local copies of the pages when the live site can't be reached |

## Use them

```bash
git clone https://github.com/ethanplusai/harvey.git && cd harvey
python3.13 -m venv .venv && source .venv/bin/activate && pip install -e .
cp /path/to/Ecocourse/docs/sales/harvey/harvey.local.yaml .
cp /path/to/Ecocourse/docs/sales/harvey/skills/*.md skills/
```

Or retrain from the live site: `harvey train https://autowebly.vercel.app`.

## Before sending anything

- `compliance.postal_address` is empty. Cold email must include one.
- `channels.email.booking_url` is empty; add a calendar link so prospects can book a call.
