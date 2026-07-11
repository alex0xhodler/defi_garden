# 031 build notes
- 4-line cleanup in main(): readdir out dir, rm *.html, before writing. cwd guard prevents nuking the repo if mispointed; only .html touched.
- Demonstrated offline: run full fixture -> 5 pages; plant a stale page + rerun a 1-token fixture -> dir left with ONLY big.html. git add tokens stages deletions (modern git).
- Pairs with 030 so the next CI run actually removes the ~2861 pre-gate pages that no longer qualify, and refreshes the rest with the 023/028/029 improvements.
