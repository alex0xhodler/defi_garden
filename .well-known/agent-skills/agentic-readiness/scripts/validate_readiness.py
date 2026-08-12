import urllib.request
import json
import sys

def verify_url(url, headers=None, expected_content_type=None, post_data=None, optional=False):
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
        if optional:
            print(f"  [WARN] Optional endpoint failed (Skipped): {e}\n")
        else:
            print(f"  [FAIL] Request failed: {e}\n")
            # We explicitly output a marker that the watchdog can parse
            print("  [ERROR_MARKER_FOR_WATCHDOG]")
        return None

def main():
    if len(sys.argv) > 1:
        base_url = sys.argv[1].rstrip('/')
    else:
        base_url = "https://www.defi.garden"
    
    print(f"Starting Agentic Readiness Verification for {base_url}\n" + "="*50 + "\n")
    
    # 1. robots.txt
    verify_url(f"{base_url}/robots.txt")

    # 2. Markdown Negotiation
    verify_url(f"{base_url}/", headers={"Accept": "text/markdown"}, expected_content_type="text/markdown")

    # 3. API Catalog
    verify_url(f"{base_url}/.well-known/api-catalog", expected_content_type="application/linkset+json")

    # 4. Auth.md
    verify_url(f"{base_url}/auth.md", expected_content_type="text/markdown")

    # 5. openapi.json (DeFi Garden's OpenAPI Spec)
    verify_url(f"{base_url}/openapi.json", expected_content_type="application/json")

    # 6. ACP Discovery (Optional for static-only site)
    verify_url(f"{base_url}/.well-known/acp.json", expected_content_type="application/json", optional=True)

    # 7. MCP Server (Optional for static-only site)
    verify_url(f"{base_url}/mcp", expected_content_type="application/json", optional=True)

    # 8. Agent Skills Index
    verify_url(f"{base_url}/.well-known/agent-skills/index.json", expected_content_type="application/json")

    # 9. Agent SKILL.md
    verify_url(f"{base_url}/.well-known/agent-skills/agentic-readiness/SKILL.md", expected_content_type="text/markdown")

if __name__ == '__main__':
    main()
