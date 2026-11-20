# Reads the ledger, keeps the largest row per key (the first one on ties),
# writes the kept rows dated `keep` or later to `compacted`, and prints
#   U day provider model bucket input cache_read cache_write_5m cache_write_1h output
# for every day from `from` on.

BEGIN {
  FS = OFS = "\t"
  printf "" > compacted
}

NF == 11 && (!($1 in total) || $11 + 0 > total[$1]) {
  total[$1] = $11 + 0
  row[$1] = $0
}

END {
  for (key in row) {
    split(row[key], f, "\t")
    if (f[2] < keep) continue
    print row[key] > compacted
    if (f[2] < from) continue
    group = f[2] "\t" f[3] "\t" f[4] "\t" f[5]
    groups[group] = 1
    for (c = 6; c <= 10; c++) sum[group, c] += f[c]
  }
  close(compacted)
  for (group in groups) {
    printf "U\t%s\t%.0f\t%.0f\t%.0f\t%.0f\t%.0f\n", group, sum[group, 6], sum[group, 7], sum[group, 8], sum[group, 9], sum[group, 10]
  }
}
