# Terrarium as an MCP server

An AI assistant that supports MCP (WorkBuddy, Claude Code, Claude Desktop and others) can ask Terrarium about one simulated home. The server runs on your machine over stdio. It only reads.

## What it offers

| Tool | What it does |
|---|---|
| `first_look` | What a month in the home costs: electricity and bill, the walk to the bus stop, the home score with its strongest and weakest pillar, and the one change that cuts the most carbon |
| `simulate_month` | Every figure with its grade, the four pillar scores with their formulas, and the home score |
| `what_if` | The effect of one change: `acHours`, `setpoint`, `walkShare`, `trees` or `solarKwp` |
| `compare_homes` | The home against an alternative home type, floor or lot with the same habits (lots numbered 1 to 12) |
| `list_lots` | The twelve lots with their distance to the bus stop |
| `where_from` | The source and grade of one assumption |
| `ask` | A question in your own words, answered only from the model |

Every answer comes from the same model, assistant and verifier the page uses, so each figure is recomputed before it is returned, and an answer that fails the check is withheld. The text ends with "Checked N figures against the model."

**Read the grades.** A figure is REAL (public data), SOURCED (an assumption with a published source) or ILLUSTRATIVE (a placeholder). The township layout is a drawing, so lot distances are illustrative. The server tells the client this in its instructions, but a client that rewords the answer is not checked by anything.

## Try it in WorkBuddy

1. In this folder run `npm ci` once.
2. Choose the home. Until the app has an export button, copy `examples/home.json` and edit it (house `terrace`, `semid` or `condo`; `level` 1 to 8 for a condo; `lot` 0 to 11; the habits). A wrong file is refused at start with a reason; it never silently falls back.
3. Print the config with your paths filled in:
   ```
   node mcp/print-config.mjs workbuddy --home examples/home.json
   ```
4. Put the printed block into `~/.workbuddy-ai/mcp.json` (merge it into any existing `mcpServers`), or paste it through Add MCP in WorkBuddy's settings, which edits the same file.
5. Start a new chat. In the logs under `~/.workbuddy-ai/logs/<date>/` look for `MCP-ManagerConnect ... state=ready` for `terrarium`. Its tools appear as `mcp__terrarium__first_look` and so on.
6. Ask, for example:
   - "What would living in my home cost me?"
   - "Compare my home with the lot nearest the bus stop."
   - "What if I run the air-con two hours less?"
   - "Where does the carbon number come from, and how sure is it?"
   - "Which lots are closest to the bus stop?"

## What to check

- The figures match what the page shows for the same home.
- The answer says which figures are illustrative.
- A question the model cannot answer ("what is the weather on Mars?") is refused, not invented.
- A bad value ("lot 99", a change that does not exist) is rejected, not guessed at.

## Other clients

```
node mcp/print-config.mjs claude-code --home /absolute/path/to/home.json
node mcp/print-config.mjs claude-desktop --home /absolute/path/to/home.json
node mcp/print-config.mjs generic --home /absolute/path/to/home.json
node mcp/print-config.mjs workbuddy --defaults
```

`--defaults` runs on a default demo home and says so. Add `--node /full/path/to/node` if the client cannot find `node`.

## If it does not connect

- **Use absolute paths.** `print-config` does. A `~` is not expanded by most clients.
- **`node` not found.** Apps launched from the desktop often do not see your shell's PATH. Pass `--node` with the full path.
- **Why the home is an argument, not an environment variable.** WorkBuddy did not reliably pass `env` to a local server when this was built, so the config avoids it.
- **A connector shows "needs authorization".** A local server needs none. Rename the entry to clear the cached state.
- **The server exits at start.** It exits with code 2 and writes the reason to stderr: no home given, an unreadable or oversized file, the wrong format, or an unknown argument. Run `node mcp/server.mjs --home <file>` in a terminal to see the message.
- stdout carries only the protocol. Messages for a person go to stderr.

## What the first real session showed

WorkBuddy connected, called the tools and quoted the figures correctly. Every number it gave matched the model. Its own wording around the numbers was wrong in two places, which no checker can catch because the checker only covers the tool's text:

- It read the Energy Low Carbon score backwards ("your carbon is above the neighbour benchmark") when the score was 67 because the home emits *less* than the neighbour household (256 kg against 344 kg).
- It described a farther lot as "cheaper". The model has no prices; a farther lot costs more to run.

It also multiplied one illustrative month by 12 into a yearly cost, and called the configured home a "default".

What changed because of that: the tool output now states every score's direction in numbers ("your carbon is 256 kg against 344 kg for the neighbour household"), states the running cost for the month and what is not modelled, says there are no prices for homes or lots, and the server's instructions name the loaded home and warn against annualising. A client can still reword an answer badly. For anything that matters, read the tool's own text.

## What it does not do

- It writes nothing, sends nothing and changes nothing. All seven tools are marked read-only.
- It does not touch the network. The home is a file on your machine.
- It does not reach your saved home in the browser. The app keeps that in the browser's own storage, which another program cannot read, so the home has to be exported to a file.
- It is not a hosted service. A shared server would need real authentication and a data-protection decision first.
