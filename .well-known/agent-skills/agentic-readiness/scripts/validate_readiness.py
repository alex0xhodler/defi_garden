import urllib.request
import json
import sys

def verify_url(url, headers=None, expected_content_type=None, post_data=None):
    print(f"Verifying {url}...")
    req = urllib.request.Request(url, headers=headers or {})
    if post_data:
        req.data = json.dumps(post_data).encode('utf-8')
        req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            status = response.status
            content_type = response.headers.get('Content-Type', '')
            body = response.read().decode('utf-8')
            print(f"  [PASS] Status: {status}")
            print(f"  [PASS] Content-Type: {content_type}")
            if expected_content_type and expected_content_type not in content_type:
                print(f"  [WARN] Expected Content-Type matching {expected_content_type}, got {content_type}")
            
            # Print a snippet of the response
            lines = body.strip().split('\n')
            snippet = '\n'.join(lines[:5]) + ('\n...' if len(lines) > 5 else '')
            print(f"  Snippet:\n{snippet}\n")
            return body
    except Exception as e:
        print(f"  [FAIL] Request failed: {e}\n")
        return None

def main():
    if len(sys.argv) > 1:
        base_url = sys.argv[1].rstrip('/')
    else:
        base_url = "https://www.0xhodler.nl"
    
    print(f"Starting Agentic Readiness Verification for {base_url}\n" + "="*50 + "\n")
    
    # 1. robots.txt
    verify_url(f"{base_url}/robots.txt")

    # 2. Markdown Negotiation
    verify_url(f"{base_url}/", headers={"Accept": "text/markdown"}, expected_content_type="text/markdown")

    # 3. API Catalog
    verify_url(f"{base_url}/.well-known/api-catalog", expected_content_type="application/linkset+json")

    # 4. Auth.md
    verify_url(f"{base_url}/auth.md", expected_content_type="text/markdown")

    # 5. ACP Discovery
    verify_url(f"{base_url}/.well-known/acp.json", expected_content_type="application/json")

    # 6. MCP Server (GET)
    verify_url(f"{base_url}/api/mcp", expected_content_type="application/json")

    # 7. MCP Server (POST initialize)
    verify_url(f"{base_url}/api/mcp", post_data={"jsonrpc": "2.0", "id": 1, "method": "initialize"})

    # 8. MCP Server (POST tools/list)
    verify_url(f"{base_url}/api/mcp", post_data={"jsonrpc": "2.0", "id": 1, "method": "tools/list"})

    # 9. MCP Server (POST tools/call get_studio_stats)
    verify_url(f"{base_url}/api/mcp", post_data={"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "get_studio_stats"}})

    # 10. Agent Skills Index
    verify_url(f"{base_url}/.well-known/agent-skills/index.json", expected_content_type="application/json")

    # 11. Agent SKILL.md
    verify_url(f"{base_url}/.well-known/agent-skills/0xhodler-discovery/SKILL.md", expected_content_type="text/markdown")

if __name__ == '__main__':
    main()
