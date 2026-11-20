# Appends one ledger row for every model request it has not recorded yet.
#
# Input: `grep -H` output, "<path>.jsonl:<json line>", grouped by file.
# Ledger columns (tab separated):
#   key day provider model bucket input cache_read cache_write_5m cache_write_1h output total
#
# Claude Code: one request per message id and request id. Streaming writes the
# same request more than once, so a later row with a larger total supersedes it.
# Codex: one request per token_count event. A resumed session or a subagent
# replays its parent's events in a new file, so the key is the session, the
# model, the request's usage and the running session total: a replay repeats
# all of them and is skipped (the rule ai-token-monitor uses).

BEGIN {
  OFS = "\t"
  while ((getline row < ledger) > 0) {
    if (split(row, f, "\t") == 11 && (!(f[1] in best) || f[11] + 0 > best[f[1]])) best[f[1]] = f[11] + 0
  }
  close(ledger)
  while ((getline row < cwds) > 0) seen_cwd[row] = 1
  close(cwds)
}

# The string value of the first "key":"..." in s.
function text(s, key) {
  if (!match(s, "\"" key "\":\"[^\"]*\"")) return ""
  return substr(s, RSTART + length(key) + 4, RLENGTH - length(key) - 5)
}

# The integer value of the first "key":123 in s, or 0.
function number(s, key) {
  if (!match(s, "\"" key "\":[0-9]+")) return 0
  return substr(s, RSTART + length(key) + 3, RLENGTH - length(key) - 3) + 0
}

# The flat object after "name":{ up to its closing brace.
function object(s, name,   start, rest) {
  start = index(s, "\"" name "\":{")
  if (!start) return ""
  rest = substr(s, start)
  return substr(rest, 1, index(rest, "}"))
}

function is_day(day) {
  return day ~ /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]$/
}

# Prompt-size band: the pricing tiers switch at 100k, 200k and 272k tokens.
function bucket(prompt) {
  if (prompt > 272000) return 3
  if (prompt > 200000) return 2
  if (prompt > 100000) return 1
  return 0
}

function remember_cwd(dir) {
  if (dir == "" || dir in seen_cwd) return
  seen_cwd[dir] = 1
  print dir >> cwds
  print dir >> new_cwds
}

function add(key, day, model, prompt, input, cache_read, write_5m, write_1h, output,   total) {
  total = input + cache_read + write_5m + write_1h + output
  if (total <= 0 || (key in best && best[key] >= total)) return
  best[key] = total
  print key, day, provider, model, bucket(prompt), input, cache_read, write_5m, write_1h, output, total >> ledger
}

function claude(line,   head, usage, id, model, input, cache_read, created, write_5m, write_1h, day) {
  if (!index(line, "\"type\":\"assistant\"") || !index(line, "\"usage\":{") || !index(line, "\"message\":{")) return
  head = substr(line, index(line, "\"message\":{"), 400)
  id = text(head, "id")
  model = text(head, "model")
  if (id == "" || model == "" || model == "<synthetic>") return
  usage = substr(line, index(line, "\"usage\":{"), 1500)
  input = number(usage, "input_tokens")
  cache_read = number(usage, "cache_read_input_tokens")
  created = number(usage, "cache_creation_input_tokens")
  write_5m = number(usage, "ephemeral_5m_input_tokens")
  write_1h = number(usage, "ephemeral_1h_input_tokens")
  if (write_5m + write_1h == 0) write_5m = created
  day = substr(text(line, "timestamp"), 1, 10)
  if (!is_day(day)) return
  remember_cwd(text(line, "cwd"))
  add("c|" id "|" text(line, "requestId"), day, model, input + cache_read + write_5m + write_1h,
      input, cache_read, write_5m, write_1h, number(usage, "output_tokens"))
}

function codex(line,   found, last, running, input, cached, written, output, request, day, uncached) {
  if (index(line, "\"type\":\"session_meta\"")) {
    found = text(substr(line, 1, 2000), "id")
    if (found != "") session = found
    return
  }
  if (index(line, "\"type\":\"turn_context\"")) {
    found = text(line, "model")
    if (found != "") model = found
    remember_cwd(text(line, "cwd"))
    return
  }
  if (!index(line, "\"type\":\"token_count\"") || !index(line, "\"info\":{")) return
  running = object(line, "total_token_usage")
  last = object(line, "last_token_usage")
  if (last == "") last = running
  if (last == "") return
  input = number(last, "input_tokens")
  cached = number(last, "cached_input_tokens")
  written = number(last, "cache_write_input_tokens")
  output = number(last, "output_tokens")
  request = input "," cached "," written "," output "," number(last, "total_tokens")
  if (request == previous) return
  previous = request
  day = substr(text(line, "timestamp"), 1, 10)
  if (!is_day(day)) day = path_day
  if (!is_day(day)) return
  uncached = input - cached - written
  if (uncached < 0) uncached = 0
  add("x|" session "|" model "|" request "|" number(running, "input_tokens") "," number(running, "cached_input_tokens") "," \
      number(running, "output_tokens") "," number(running, "reasoning_output_tokens") "," number(running, "total_tokens"),
      day, model == "" ? "codex" : model, input, uncached, cached, written, 0, output)
}

{
  split_at = index($0, ".jsonl:")
  if (!split_at) next
  path = substr($0, 1, split_at + 5)
  if (path != current) {
    current = path
    session = ""
    model = ""
    previous = ""
    path_day = ""
    if (match(path, /\/[0-9][0-9][0-9][0-9]\/[0-9][0-9]\/[0-9][0-9]\//)) {
      path_day = substr(path, RSTART + 1, 4) "-" substr(path, RSTART + 6, 2) "-" substr(path, RSTART + 9, 2)
    }
  }
  if (provider == "codex") codex(substr($0, split_at + 7))
  else claude(substr($0, split_at + 7))
}
