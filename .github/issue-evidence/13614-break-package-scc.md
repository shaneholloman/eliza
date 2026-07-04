# Issue #13614 - Break 13-package circular dependency SCC

## Change Proven

- Removed `@elizaos/cloud-shared -> @elizaos/app-core` by replacing type imports with a local structural `AccountPool` contract and keeping the concrete app-core pool as a lazy optional runtime import.
- Removed `@elizaos/plugin-wallet -> @elizaos/app-core` by moving the automation-node contributor registry/builder to `@elizaos/shared/automation-node-contributors` and leaving `@elizaos/app-core/api/automation-node-contributors` as a compatibility re-export.
- Updated wallet, Hyperliquid, and LifeOps automation-node contributors to use the shared contributor registry directly.

## Dependency Graph Evidence

Command:

```bash
node - <<'NODE'
const fs=require('fs'), path=require('path'); const root=process.cwd();
function walk(d,out=[]){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(['.git','node_modules','dist','.turbo'].includes(e.name))continue; const p=path.join(d,e.name); if(e.isDirectory())walk(p,out); else if(e.name==='package.json')out.push(p)}return out}
const pkgs=new Map(); for(const f of walk(root)){const j=JSON.parse(fs.readFileSync(f,'utf8')); if(j.name?.startsWith('@elizaos/')) pkgs.set(j.name,{json:j,dir:path.dirname(f)})}
function depsOf(pkg){const j=pkg.json; const all={...j.dependencies,...j.devDependencies,...j.peerDependencies,...j.optionalDependencies}; return Object.keys(all).filter(n=>pkgs.has(n));}
let i=0; const idx=new Map,low=new Map,st=[],on=new Set,res=[]; function dfs(v){idx.set(v,i);low.set(v,i++);st.push(v);on.add(v); for(const w of depsOf(pkgs.get(v))){if(!idx.has(w)){dfs(w); low.set(v,Math.min(low.get(v),low.get(w)))} else if(on.has(w)) low.set(v,Math.min(low.get(v),idx.get(w)))} if(low.get(v)===idx.get(v)){const c=[]; let w; do{w=st.pop();on.delete(w);c.push(w)}while(w!==v); if(c.length>1) res.push(c.sort())}} for(const v of pkgs.keys()) if(!idx.has(v)) dfs(v); console.log('SCC count', res.length); for(const c of res.sort((a,b)=>b.length-a.length)) console.log(c.length, c.join(', '));
NODE
```

Observed output:

```text
SCC count 0
```

Manual review: before the change, the same graph script reported one 13-package SCC containing `@elizaos/agent`, `@elizaos/app-core`, `@elizaos/cloud-shared`, `@elizaos/plugin-wallet`, and related plugins/UI. Removing only `cloud-shared -> app-core` left a 3-package `app-core -> agent -> plugin-wallet -> app-core` cycle. Removing both implemented edges eliminated all package SCCs.

## Validation

Passed:

```bash
bunx @biomejs/biome@2.5.2 check <touched source files>
git diff --check
bun - <<'BUN' # shared automation-node contributor smoke
bun - <<'BUN' # app-core compatibility re-export smoke
bun - <<'BUN' # cloud account-pool structural contract smoke
bunx tsc -p packages/shared/tsconfig.json --noEmit --pretty false
```

Blocked by lean worktree dependency state:

```text
bun run --cwd plugins/plugin-wallet test src/automation-node-contributor.test.ts
bun run --cwd plugins/plugin-hyperliquid test src/automation-node-contributor.test.ts
bun run --cwd plugins/plugin-personal-assistant test src/automation-node-contributor.error-policy.test.ts
```

All three package scripts reached `vitest` and failed with `vitest: command not found` because this evidence worktree intentionally has no `node_modules`.

```text
bunx tsc -p packages/cloud/shared/tsconfig.json --noEmit --pretty false
```

This stopped before source checking on missing `@types/node`, also due to the no-install worktree. The focused runtime smoke imported the cloud contract and `DrizzleAccountPoolDeps` successfully.

## Evidence N/A

- Real-LLM trajectory: N/A - no agent prompt/action/model behavior changed.
- UI screenshots/video/frontend logs: N/A - no UI rendering changed.
- Backend runtime logs: N/A - this is a package dependency graph refactor; no server route or scheduler was run.
- DB/domain artifacts: N/A - no schema or data path changed.
