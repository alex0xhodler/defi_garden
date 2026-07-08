#!/usr/bin/env python3
"""
Statically re-runnable script to auto-provision DNS-AID (DNS for AI Discovery)
records on Cloudflare via API v4.

This script provisions all 12 standard-compliant DNS-AID records:
- General Discovery (_index._agents) HTTPS and TXT
- Model Context Protocol (_mcp._agents) HTTPS and TXT
- Agent-to-Agent Catalog (_a2a._agents) HTTPS and TXT
For BOTH the apex domain and the 'www.' subdomain.

Supports standard Cloudflare API formatting rules, ensuring valid HTTPS/SVCB JSON payload parameters.
"""

import sys
import json
import urllib.request
import urllib.error

def make_request(url, headers, method="GET", data=None):
    req = urllib.request.Request(
        url,
        headers=headers,
        data=json.dumps(data).encode() if data else None,
        method=method
    )
    try:
        with urllib.request.urlopen(req) as res:
            return json.loads(res.read().decode())
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()
        try:
            return json.loads(err_body)
        except:
            return {"success": False, "errors": [{"message": err_body}]}
    except Exception as e:
        return {"success": False, "errors": [{"message": str(e)}]}

def get_zone_id(domain, headers):
    url = f"https://api.cloudflare.com/client/v4/zones?name={domain}"
    res = make_request(url, headers)
    if res.get("success") and res.get("result"):
        return res["result"][0]["id"]
    return None

def provision_dns_aid(domain, token):
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    print(f"[*] Retrieving Zone ID for {domain}...")
    zone_id = get_zone_id(domain, headers)
    if not zone_id:
        print(f"[!] Error: Could not find Cloudflare Zone ID for domain '{domain}'. Verify your token permissions.")
        sys.exit(1)
    print(f"[+] Found Zone ID: {zone_id}")
    
    # Define target endpoint details (assuming standard layout)
    target_www = f"www.{domain}."
    
    records = [
        # Apex Domain
        {
            "type": "HTTPS",
            "name": f"_index._agents.{domain}",
            "data": {"priority": 1, "target": target_www, "value": 'alpn="h2" port=443'},
            "ttl": 300
        },
        {
            "type": "TXT",
            "name": f"_index._agents.{domain}",
            "content": "content-signal: ai-train=no, search=yes, ai-input=no",
            "ttl": 300
        },
        {
            "type": "HTTPS",
            "name": f"_mcp._agents.{domain}",
            "data": {"priority": 1, "target": target_www, "value": 'alpn="h2" port=443'},
            "ttl": 300
        },
        {
            "type": "TXT",
            "name": f"_mcp._agents.{domain}",
            "content": f"mcp-server-card=https://www.{domain}/.well-known/mcp/server-card.json",
            "ttl": 300
        },
        {
            "type": "HTTPS",
            "name": f"_a2a._agents.{domain}",
            "data": {"priority": 1, "target": target_www, "value": 'alpn="h2" port=443'},
            "ttl": 300
        },
        {
            "type": "TXT",
            "name": f"_a2a._agents.{domain}",
            "content": f"api-catalog=https://www.{domain}/.well-known/api-catalog",
            "ttl": 300
        },
        
        # www Subdomain
        {
            "type": "HTTPS",
            "name": f"_index._agents.www.{domain}",
            "data": {"priority": 1, "target": target_www, "value": 'alpn="h2" port=443'},
            "ttl": 300
        },
        {
            "type": "TXT",
            "name": f"_index._agents.www.{domain}",
            "content": "content-signal: ai-train=no, search=yes, ai-input=no",
            "ttl": 300
        },
        {
            "type": "HTTPS",
            "name": f"_mcp._agents.www.{domain}",
            "data": {"priority": 1, "target": target_www, "value": 'alpn="h2" port=443'},
            "ttl": 300
        },
        {
            "type": "TXT",
            "name": f"_mcp._agents.www.{domain}",
            "content": f"mcp-server-card=https://www.{domain}/.well-known/mcp/server-card.json",
            "ttl": 300
        },
        {
            "type": "HTTPS",
            "name": f"_a2a._agents.www.{domain}",
            "data": {"priority": 1, "target": target_www, "value": 'alpn="h2" port=443'},
            "ttl": 300
        },
        {
            "type": "TXT",
            "name": f"_a2a._agents.www.{domain}",
            "content": f"api-catalog=https://www.{domain}/.well-known/api-catalog",
            "ttl": 300
        }
    ]
    
    url = f"https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records"
    
    print(f"[*] Provisioning {len(records)} DNS-AID entries on Cloudflare...")
    for idx, rec in enumerate(records):
        name = rec["name"]
        rtype = rec["type"]
        
        # Check if record already exists to prevent duplicate failures
        check_url = f"https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records?name={name}&type={rtype}"
        check_res = make_request(check_url, headers)
        
        if check_res.get("success") and check_res.get("result"):
            print(f"[~] {name} ({rtype}) already exists. Skipping.")
            continue
            
        # Create record
        create_res = make_request(url, headers, method="POST", data=rec)
        if create_res.get("success"):
            print(f"[+] Created: {name} ({rtype})")
        else:
            err = create_res.get("errors", [{"message": "Unknown error"}])[0]["message"]
            print(f"[x] Failed: {name} ({rtype}) - Error: {err}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 provision_dns_aid.py <domain> <cloudflare_api_token>")
        sys.exit(1)
    provision_dns_aid(sys.argv[1], sys.argv[2])
