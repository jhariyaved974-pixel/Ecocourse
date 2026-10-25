import json, os, urllib.parse
T = open('template.html').read()
sites = [
 dict(slug="abhyaas-tutors-jabalpur", name="Abhyaas Tutors", area="New Ramnagar, Adhartal, Jabalpur", phone="917041734569",
      tag="Strong basics. Better marks. Confident students.", hero="Tuition for Classes 6–12 in Adhartal",
      services=[("📘","Classes 6–10","All subjects with regular tests and doubt sessions"),("🧪","Classes 11–12","Science & Commerce, board-focused preparation"),("📝","Weekly Tests","Progress report shared with parents every month"),("👥","Small Batches","Personal attention for every student")],
      color="#2563eb"),
 dict(slug="naushera-defence-academy", name="Naushera Defence Academy", area="Dr Barat Road, Russell Chowk, Jabalpur", phone="917041723783",
      tag="Your journey to the uniform starts here.", hero="NDA, CDS, Army & Agniveer coaching in Jabalpur",
      services=[("🎖️","NDA / CDS","Written exam preparation with mock tests"),("🏃","Physical Training","Running, fitness and ground preparation"),("🗣️","SSB Interview","Personality, GD and interview guidance"),("🪖","Agniveer & Army GD","Complete preparation for written and physical")],
      color="#15803d"),
 dict(slug="future-commerce-academy", name="Future Commerce Academy", area="Telegraph Gate No. 4, Wright Town, Jabalpur", phone="917041870746",
      tag="Commerce made simple.", hero="Accounts, Economics & Business Studies coaching",
      services=[("📊","Class 11–12 Commerce","Accounts, Economics, BST with board focus"),("🎓","B.Com","Semester-wise coaching for university exams"),("🧾","CA Foundation","Concept-first preparation with practice papers"),("📝","Regular Tests","Weekly tests and parent updates")],
      color="#7c3aed"),
]
for s in sites:
    wa = "https://wa.me/%s?text=%s" % (s['phone'], urllib.parse.quote("Namaste, mujhe %s ke baare mein jaankari chahiye." % s['name']))
    cards = "".join(f'<div class="card"><div class="ic">{i}</div><h3>{t}</h3><p>{d}</p></div>' for i,t,d in s['services'])
    h = T
    for k,v in dict(NAME=s['name'],AREA=s['area'],TAG=s['tag'],HERO=s['hero'],CARDS=cards,WA=wa,COLOR=s['color'],PHONE="+"+s['phone'],MAPQ=urllib.parse.quote(s['name']+" "+s['area'])).items():
        h = h.replace("{{"+k+"}}", v)
    os.makedirs(s['slug'], exist_ok=True)
    open(f"{s['slug']}/index.html","w").write(h)
print("ok")
