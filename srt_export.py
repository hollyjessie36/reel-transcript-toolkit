"""Export UTF-8 numbered SRT to readable TXT or a millisecond CSV table."""
import argparse,csv,re,sys
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
p.add_argument("file",type=Path)
p.add_argument("--csv",action="store_true")
args=p.parse_args()
rows=[]
stamp=r"(\d{2,}):([0-5]\d):([0-5]\d),(\d{3})"
def ms(parts):
 h,m,s,f=map(int,parts)
 return ((h*60+m)*60+s)*1000+f
for block in re.split(r"\n[ \t]*\n",args.file.read_text(encoding="utf-8-sig").strip()):
 lines=block.splitlines()
 if len(lines)<3 or not lines[0].isdecimal():p.error("Expected a numbered cue with text")
 m=re.fullmatch(stamp+" --> "+stamp,lines[1])
 if not m:p.error("Bad timestamp in cue "+lines[0])
 a,b=ms(m.groups()[:4]),ms(m.groups()[4:])
 if b<a:p.error("End precedes start in cue "+lines[0])
 rows.append((lines[0],a,b," ".join(lines[2:]),lines[1].split(",")[0]))
sys.stdout.reconfigure(encoding="utf-8")
if args.csv:
 w=csv.writer(sys.stdout,lineterminator="\n")
 w.writerow(("cue","start_ms","end_ms","text"))
 w.writerows(r[:4] for r in rows)
else:
 for _,_,_,text,t in rows:print(f"[{t}] {text}")
