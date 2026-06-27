# Test Fixtures

## zipslip.zip

A zip archive containing an entry with a path traversal (`../evil.txt`).
Create it with:

```bash
mkdir -p /tmp/zipslip-src
echo "evil" > /tmp/zipslip-src/evil.txt
cd /tmp && zip zipslip.zip zipslip-src/../evil.txt
cp /tmp/zipslip.zip tests/fixtures/zipslip.zip
```
