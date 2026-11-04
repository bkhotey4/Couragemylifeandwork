// 進度、備份、自評、信件、行事曆、抒壓書寫、去留決策與呼吸練習。
// 共用 index.html 主程式裡的 $、load、store、wins、moods 等；放在區塊裡，新名稱才不會和主程式衝突。
{
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (/Mac/.test(navigator.platform) && navigator.maxTouchPoints > 1);
  // iPhone 上直接下載常常沒反應（尤其從主畫面打開時），能分享就走分享選單，讓使用者存到「檔案」
  const saveFile = async (blob, name) => {
    if (isIOS && navigator.canShare) {
      const file = new File([blob], name, { type: blob.type });
      if (navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file] }); return true; }
        catch (e) { if (e.name === "AbortError") return false; }
      }
    }
    download(blob, name);
    return true;
  };
  const numbered = (arr, empty) => arr.length ? arr.map((x, i) => `${i + 1}. ${x}`).join("\n") : empty;
  const linesOf = v => v.split("\n").map(x => x.trim()).filter(Boolean);
  const winShort = w => w.text + (w.num ? `（${w.num}）` : "");

  // 備份與還原：所有紀錄存成一個檔案，還原前會先驗證整份檔案，壞檔不會蓋掉現有資料
  const BACKUP_APP = "courage-backup";
  const BACKUP_KEYS = {
    "repair-30": isObj,
    "story-fav": Array.isArray,
    "story-read": Array.isArray,
    "wins-log": v => Array.isArray(v) && v.every(isWin),
    "mood-log": isObj,
    "decide": isObj
  };
  const moodDays = log => Object.values(log).filter(m => Number.isInteger(m) && m >= 1 && m <= 5).length;
  const summary = d => `成果 ${(d["wins-log"] || []).length} 筆、心情 ${moodDays(d["mood-log"] || {})} 天、讀過 ${(d["story-read"] || []).length} 則`;
  const backupData = () => Object.fromEntries(Object.keys(BACKUP_KEYS).map(k => [k, load(k, null, BACKUP_KEYS[k])]));
  const hasData = () => Object.values(backupData()).some(v => v && Object.keys(v).length);
  const lastBackup = () => load("backup-at", "", v => /^\d{4}-\d{2}-\d{2}$/.test(v));
  const backupAge = () => {
    const at = lastBackup();
    return at ? Math.floor((new Date(dateKey(new Date())) - new Date(at)) / 86400000) : null;
  };

  $("backup-save").addEventListener("click", async () => {
    const today = dateKey(new Date());
    const body = JSON.stringify({ app: BACKUP_APP, version: 1, exported: today, data: backupData() }, null, 1);
    const saved = await saveFile(new Blob([body], { type: "application/json" }), `再站起來-備份-${today}.json`);
    if (saved) store("backup-at", today);
  });
  $("backup-load").addEventListener("click", () => $("backup-file").click());
  $("backup-file").addEventListener("change", async e => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const fail = () => { $("backup-msg").textContent = "這個檔案不是有效的備份，資料沒有變動。"; };
    if (file.size > 5e6) return fail();
    let backup;
    try { backup = JSON.parse(await file.text()); } catch (err) { return fail(); }
    if (!isObj(backup) || backup.app !== BACKUP_APP || !isObj(backup.data)) return fail();
    const keys = Object.keys(BACKUP_KEYS).filter(k => k in backup.data);
    if (!keys.length || !keys.every(k => backup.data[k] === null || BACKUP_KEYS[k](backup.data[k]))) return fail();
    const when = typeof backup.exported === "string" ? backup.exported.slice(0, 10) : "不明";
    if (!confirm(`備份日期 ${when}：${summary(backup.data)}。\n\n還原後會取代這台裝置目前的資料（${summary(backupData())}）。確定要還原嗎？`)) return;
    const before = keys.map(k => [k, localStorage.getItem(k)]);
    try {
      keys.forEach(k => {
        if (backup.data[k] === null) localStorage.removeItem(k);
        else localStorage.setItem(k, JSON.stringify(backup.data[k]));
      });
    } catch (err) {
      // 寫到一半失敗（例如空間不足）就復原，不留下半份資料
      before.forEach(([k, v]) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (x) {} });
      $("backup-msg").textContent = "瀏覽器無法寫入資料，還原沒有完成，原本的資料沒有變動。";
      return;
    }
    location.hash = "#progress";
    location.reload();
  });

  // 我的進度
  const statTile = (big, small) => {
    const d = el("div", "stat");
    d.append(el("b", "", big), el("span", "", small));
    return d;
  };
  const renderProgress = () => {
    const done = [...boxes].filter(b => b.checked);
    const readCount = stories.filter(s => reads.has(titleOf(s))).length;
    const monthAgo = dateKey(daysAgo(29));
    const last = avgOf(0, 6), prev = avgOf(7, 13);
    const trend = last && prev ? (last.avg - prev.avg > 0.2 ? "比前一週好一些" : last.avg - prev.avg < -0.2 ? "比前一週低一點" : "和前一週差不多") : "記滿兩週就看得到趨勢";
    $("stats").replaceChildren(
      statTile(`${done.length} / ${boxes.length}`, "30 天計畫完成項目"),
      statTile(String(wins.length), `筆成果，近 30 天 ${wins.filter(w => w.date >= monthAgo).length} 筆`),
      statTile(`${readCount} / ${stories.length}`, `則故事讀過，收藏 ${favs.size} 則`),
      statTile(`${moodDays(moods)} 天`, `心情紀錄，${trend}`)
    );

    const steps = [];
    if (!moodOn(new Date())) steps.push(["#mood", "點一下，記錄今天的心情"]);
    if (!wins.some(w => w.date >= dateKey(daysAgo(6)))) steps.push(["#wins", "這週還沒記成果，寫下一件做到的小事"]);
    const next = [...boxes].find(b => !b.checked);
    if (next) steps.push(["#repair", "30 天計畫的下一項：" + next.closest("label").textContent.trim()]);
    const age = backupAge();
    if (hasData() && (age === null || age > 30)) steps.push(["#backup", age === null ? "還沒備份過，下載一份備份檔" : `上次備份是 ${age} 天前，該再備份一次了`]);
    if (!steps.length) steps.push(["#stories", "今天該做的都做了。讀一則故事，然後好好休息"]);
    $("next-list").replaceChildren(...steps.map(([href, text]) => {
      const li = el("li"), a = el("a", "", text);
      a.href = href;
      li.append(a);
      return li;
    }));

    $("backup-info").textContent = "所有紀錄都只存在這台裝置。換手機前先下載備份檔，存到雲端硬碟或寄給自己，到新手機再還原。" +
      (age === null ? "目前還沒有備份。" : `上次備份：${lastBackup()}。`);
  };

  // 自評草稿：只整理使用者記下的內容，不知道的部分留括號請本人補上，不替他編造
  let picked = null, rvText = "";
  const rvPool = () => {
    const months = +$("rv-range").value;
    if (!months) return sortedWins();
    const from = new Date();
    from.setMonth(from.getMonth() - months);
    return sortedWins().filter(w => w.date >= dateKey(from));
  };
  const renderReview = () => {
    const pool = rvPool();
    // 還沒手動勾選時，先選有數字的成果，最多 6 筆
    const auto = [...pool].sort((a, b) => !a.num - !b.num).slice(0, 6);
    const on = picked || new Set(auto.map(w => String(w.id)));
    $("rv-hint").textContent = !wins.length ? "成果記錄器還沒有資料，先記幾筆再回來。"
      : pool.length ? "勾選要放進草稿的成果。有數字的成果最有說服力。" : "這段時間沒有成果紀錄，換一個時間範圍試試。";
    $("rv-list").replaceChildren(...pool.map(w => {
      const label = el("label"), box = el("input");
      box.type = "checkbox";
      box.value = String(w.id);
      box.checked = on.has(String(w.id));
      label.append(box, `${w.date} ${winShort(w)}`);
      return label;
    }));
  };
  const chosenWins = () => {
    const ids = new Set([...$("rv-list").querySelectorAll("input:checked")].map(b => b.value));
    return sortedWins().filter(w => ids.has(String(w.id)));
  };
  const showDraft = (text, btn) => {
    if (!chosenWins().length) { flash(btn, "請先勾選成果"); return; }
    rvText = text;
    $("rv-out").textContent = text;
    $("rv-out").hidden = false;
    $("rv-copy").hidden = false;
  };
  $("rv-range").addEventListener("change", () => { picked = null; renderReview(); });
  $("rv-list").addEventListener("change", () => { picked = new Set(chosenWins().map(w => String(w.id))); });
  $("rv-make").addEventListener("click", e => {
    const list = chosenWins();
    if (!list.length) return showDraft("", e.currentTarget);
    const dates = list.map(w => w.date).sort();
    const cats = [...new Set(list.map(w => w.cat).filter(Boolean))].map(c => `「${c}」`).join("、");
    const items = list.map((w, i) =>
`${i + 1}. ［${w.cat || "成果"}］${w.date}
情境／任務：（補一句：當時的問題或目標是什麼？）
我的行動：${w.text}
結果：${w.num || "（補上數字或具體影響：省下多少時間、成本，良率或品質的變化）"}`).join("\n\n");
    showDraft(
`【總結】
${dates[0] === dates[dates.length - 1] ? dates[0] : `${dates[0]} 到 ${dates[dates.length - 1]} 這段期間`}，我完成了 ${list.length} 項主要成果${cats ? `，集中在${cats}` : ""}。

【主要成果】
${items}

【下一期我想做到】
（補一到兩項可以衡量的目標，最好和主管確認過）`, e.currentTarget);
  });
  $("rv-cv").addEventListener("click", e => {
    showDraft(chosenWins().map(w => "・" + winShort(w)).join("\n") +
      "\n\n（履歷小提醒：用動詞開頭、用數字收尾，並拿掉公司內部的代號與機密。）", e.currentTarget);
  });
  $("rv-copy").addEventListener("click", e => copyText(e.currentTarget, rvText));

  // 信件範本
  const LETTERS = {
    confirm: {
      hint: "面談當天或隔天寄出，趁雙方都還記得。",
      points: "今天談到的重點（一行一項）",
      ph: "例如：下季優先處理機台異常分析",
      fill: false,
      make: c =>
`主旨：${c.period}考績面談重點確認

${c.to}您好：

謝謝您撥時間和我談${c.period}的考績。為了確保我們的理解一致，我把談到的重點整理如下：

${c.list}

如果有理解不對或需要補充的地方，再麻煩您告訴我。之後我會依照這些重點調整工作，也想和您約每季回顧一次進度。

謝謝。
${c.me}`
    },
    expect: {
      hint: "把期待寫成文字，年底才不會變成各說各話。",
      points: "你目前理解的目標（一行一項）",
      ph: "例如：第三季完成新機台導入",
      fill: false,
      make: c =>
`主旨：想確認下一期的目標與期待

${c.to}您好：

為了讓接下來的工作方向更清楚，我想跟您確認下一期的目標。以下是我目前的理解：

${c.list}

想請您幫我確認三件事：
1. 這些目標和優先順序是否正確？
2. 每一項做到什麼程度算符合期待，什麼程度算超出期待？
3. 我們可以每季花 30 分鐘回顧一次進度嗎？

謝謝。
${c.me}`
    },
    appeal: {
      hint: "申覆的窗口和期限各公司不同，請先查工作規則或問 HR。寄出前先睡一晚，請信任的人看過；只寫可以查證的事實，附件不要放機密資料。",
      points: "希望重新檢視的部分與事實依據（一行一項）",
      ph: "例如：評語寫專案延遲，但實際提前兩週量產（附進度紀錄）",
      fill: true,
      make: c =>
`主旨：${c.period}考績申覆

${c.to}您好：

我是${c.me}。我想針對${c.period}的考績結果提出申覆。我理解評核需要考量整體狀況，提出申覆不是否定主管的判斷，而是希望評核能依據完整的事實。

【希望重新檢視的部分與事實依據】
${c.list}

【希望的處理方式】
${c.want}

相關佐證資料隨信附上。想請問後續的流程與大約的回覆時間，如果需要我補充資料，請隨時告訴我。

謝謝。
${c.me}`
    }
  };
  const renderLetterForm = () => {
    const t = LETTERS[$("l-type").value];
    $("l-hint").textContent = t.hint;
    $("l-points-label").textContent = t.points;
    $("l-points").placeholder = t.ph;
    $("l-fill-row").hidden = !t.fill;
    $("l-want-row").hidden = !t.fill;
  };
  $("l-type").addEventListener("change", renderLetterForm);
  $("l-fill").addEventListener("click", e => {
    if (!wins.length) { flash(e.currentTarget, "成果記錄器還沒有資料"); return; }
    $("l-points").value = sortedWins().slice(0, 8).map(winShort).join("\n");
  });
  $("l-make").addEventListener("click", () => {
    $("l-out").textContent = LETTERS[$("l-type").value].make({
      to: $("l-to").value.trim() || "（收件人）",
      me: $("l-me").value.trim() || "（你的名字）",
      period: $("l-period").value.trim() || "這次",
      list: numbered(linesOf($("l-points").value), "（請填上要點）"),
      want: $("l-want").value.trim() || "（請寫下希望的處理方式）"
    });
    $("l-out").hidden = false;
    $("l-copy").hidden = false;
  });
  $("l-copy").addEventListener("click", e => copyText(e.currentTarget, $("l-out").textContent));

  // 行事曆檔（.ics）：時間不帶時區，手機在哪個時區就照當地時間提醒
  const icsEsc = s => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  // 行事曆格式規定一行不能超過 75 位元組，中文要算 UTF-8 長度才不會切壞
  const icsFold = line => {
    const enc = new TextEncoder();
    let out = "", n = 0;
    for (const ch of line) {
      const size = enc.encode(ch).length;
      if (n + size > 73) { out += "\r\n "; n = 1; }
      out += ch;
      n += size;
    }
    return out;
  };
  const pad2 = n => String(n).padStart(2, "0");
  const icsTime = d => dateKey(d).replace(/-/g, "") + `T${pad2(d.getHours())}${pad2(d.getMinutes())}00`;
  const icsEvent = (uid, start, title, desc, repeat) => {
    const end = new Date(start.getTime() + 15 * 60000);
    return ["BEGIN:VEVENT", `UID:${uid}@courage`,
      "DTSTAMP:" + new Date().toISOString().replace(/[-:]|\.\d+/g, ""),
      "DTSTART:" + icsTime(start), "DTEND:" + icsTime(end),
      ...(repeat ? [repeat] : []),
      "SUMMARY:" + icsEsc(title), "DESCRIPTION:" + icsEsc(desc),
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsEsc(title), "TRIGGER:PT0M", "END:VALARM",
      "END:VEVENT"];
  };
  $("cal-date").value = dateKey(new Date());
  $("cal-make").addEventListener("click", async () => {
    const [y, m, d] = ($("cal-date").value || dateKey(new Date())).split("-").map(Number);
    const [hh, mm] = ($("cal-time").value || "20:00").split(":").map(Number);
    const site = location.origin + location.pathname.replace(/index\.html$/, "");
    const seed = Date.now();
    const events = [...document.querySelectorAll(".week")].flatMap((w, i) => {
      const todo = [...w.querySelectorAll("input:not(:checked)")].map(b => "・" + b.closest("label").textContent.trim());
      if (!todo.length) return [];
      return icsEvent(`${seed}-${i}`, new Date(y, m - 1, d + i * 7, hh, mm), w.querySelector("h3").textContent, todo.join("\n") + "\n\n" + site + "#repair");
    });
    events.push(...icsEvent(`${seed}-wins`, new Date(y, m - 1, d + 6, hh, mm), "記下這週的成果", "花一分鐘記下這週做到的事。\n\n" + site + "#wins", "RRULE:FREQ=WEEKLY;COUNT=12"));
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Courage//30 Day Plan//ZH", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR"];
    await saveFile(new Blob([lines.map(icsFold).join("\r\n") + "\r\n"], { type: "text/calendar;charset=utf-8" }), "再站起來-30天計畫.ics");
  });

  // 寫完就放下：故意不存任何東西，文字只留在輸入框裡
  const PROMPTS = [
    "這次考績，我最生氣的是……",
    "我真正想對主管說的是……",
    "我最怕的是……",
    "我覺得不公平的地方是……",
    "如果明天不用上班，我會……",
    "這件事讓我想起……",
    "我希望有人能告訴我……"
  ];
  const LET_GO = ["放下了。它不用再占著你的腦袋。", "寫出來了，就不用一直背著。", "這些話已經離開你了。", "好，今天先到這裡。"];
  let promptNo = 0, letGoNo = 0;
  const showPrompt = () => { $("v-prompt").textContent = "可以從這句開始：" + PROMPTS[promptNo % PROMPTS.length]; };
  $("v-next").addEventListener("click", () => { promptNo++; showPrompt(); });
  $("v-drop").addEventListener("click", () => {
    const box = $("v-text");
    if (!box.value.trim() || box.readOnly) return;
    box.readOnly = true;
    box.classList.add("letting-go");
    setTimeout(() => {
      box.value = "";
      box.readOnly = false;
      box.classList.remove("letting-go");
      $("v-msg").textContent = LET_GO[letGoNo++ % LET_GO.length];
    }, 1500);
  });
  showPrompt();

  // 去留決策：每個項目存 [重要度, 留下來, 內部轉調, 換公司]
  const CRITERIA = [["pay", "薪資與獎金"], ["grow", "成長與學習"], ["boss", "主管與團隊"], ["work", "工作內容"], ["life", "工時與身心"], ["safe", "穩定性"]];
  const PATHS = ["留下來", "內部轉調", "換公司"];
  const DECIDE_COLS = ["重要度", ...PATHS];
  const decide = load("decide", {}, isObj);
  const validRow = r => Array.isArray(r) && r.length === DECIDE_COLS.length && r.every(n => Number.isInteger(n) && n >= 1 && n <= 5);
  const rowOf = k => validRow(decide[k]) ? decide[k] : DECIDE_COLS.map(() => 3);
  const renderDecide = () => {
    $("d-rows").querySelectorAll("select").forEach(s => { s.value = rowOf(s.dataset.k)[+s.dataset.i]; });
    const total = CRITERIA.reduce((a, [k]) => a + rowOf(k)[0], 0);
    const scores = PATHS.map((name, p) => ({ name, p, v: CRITERIA.reduce((a, [k]) => a + rowOf(k)[0] * rowOf(k)[p + 1], 0) / total }));
    $("d-scores").replaceChildren(...scores.map(s => {
      const box = el("div", "score"), top = el("div", "top"), track = el("div", "progress"), bar = el("div", "bar");
      top.append(el("span", "", s.name), el("span", "", s.v.toFixed(1) + " / 5"));
      bar.style.width = (s.v / 5 * 100) + "%";
      track.append(bar);
      box.append(top, track);
      return box;
    }));
    if (!CRITERIA.some(([k]) => validRow(decide[k]))) {
      $("d-out").textContent = "調整上面的分數，這裡會告訴你結果。";
      return;
    }
    const [first, second] = [...scores].sort((a, b) => b.v - a.v);
    if (first.v - second.v < 0.3) {
      $("d-out").textContent = `「${first.name}」和「${second.name}」分數很接近。這代表你需要更多資訊，而不是現在就決定：找人聊聊，或做個低風險的小實驗。`;
      return;
    }
    const gain = ([k]) => { const r = rowOf(k); return r[0] * (r[first.p + 1] - r[second.p + 1]); };
    const lead = [...CRITERIA].sort((a, b) => gain(b) - gain(a))[0];
    const risk = CRITERIA.find(([k]) => rowOf(k)[0] >= 4 && rowOf(k)[first.p + 1] <= 2);
    $("d-out").textContent = `目前「${first.name}」最高，主要贏在「${lead[1]}」。` +
      (risk ? ` 不過你很重視的「${risk[1]}」在這條路只有 ${rowOf(risk[0])[first.p + 1]} 分，要想清楚能不能接受。` : "") +
      " 換公司的分數多半是想像，先和那邊的人聊過再相信它。";
  };
  CRITERIA.forEach(([k, name]) => {
    const row = el("div", "dec-row");
    row.append(el("b", "", name));
    DECIDE_COLS.forEach((col, i) => {
      const label = el("label", "", col), sel = el("select");
      sel.dataset.k = k;
      sel.dataset.i = i;
      sel.setAttribute("aria-label", `${name}：${col}`);
      [1, 2, 3, 4, 5].forEach(n => sel.append(el("option", "", String(n))));
      label.append(sel);
      row.append(label);
    });
    $("d-rows").append(row);
  });
  $("d-rows").addEventListener("change", e => {
    const { k, i } = e.target.dataset;
    const row = [...rowOf(k)];
    row[+i] = +e.target.value;
    decide[k] = row;
    store("decide", decide);
    renderDecide();
  });
  $("d-reset").addEventListener("click", () => {
    if (!confirm("清除所有分數？")) return;
    Object.keys(decide).forEach(k => delete decide[k]);
    store("decide", decide);
    renderDecide();
  });
  renderDecide();

  // 財務跑道：只在頁面上計算，不存檔
  const runway = () => {
    const save = $("rw-save").value, spend = +$("rw-exp").value, income = +$("rw-inc").value || 0;
    const out = $("rw-out");
    if (save === "" || +save < 0 || !(spend > 0)) { out.textContent = "輸入存款和每月支出（大於 0），看看跑道有多長。"; return; }
    const gap = spend - income;
    if (gap <= 0) { out.textContent = "其他收入已經足夠支應每月支出，時間站在你這邊。"; return; }
    const months = +save / gap;
    const note = months < 3 ? "緩衝偏短，建議先找好下一步再動。"
      : months < 6 ? "常見的建議是準備 3 到 6 個月，你已經在這個範圍內，可以邊工作邊找。"
      : "緩衝相對充足，但仍然建議留意找工作通常比想像中久。";
    out.textContent = `每月缺口 ${fmtNT(gap)}，大約可以撐 ${months.toFixed(1)} 個月。${note}`;
  };
  ["rw-save", "rw-exp", "rw-inc"].forEach(id => $(id).addEventListener("input", runway));

  // 2 分鐘呼吸：吸 5 吐 7，和睡眠頁的「自然放鬆」同一個節奏
  const B_STEPS = [["吸氣", 5, 1.15], ["吐氣", 7, .75]];
  const B_TOTAL = 120;
  let bTimer = null, bTick = null;
  const bLeft = sec => `${Math.floor(sec / 60)}:${pad2(sec % 60)}`;
  const bStop = () => {
    clearTimeout(bTimer);
    clearInterval(bTick);
    const orb = $("b-orb");
    orb.style.transition = "";
    orb.style.transform = "";
  };
  const bStep = (i, endAt) => {
    // 視窗已關就不再繼續（按 Esc 關閉時也一樣）
    if (!$("b-dlg").open) return bStop();
    // 只在一次吐氣結束時收尾，不會停在吸到一半
    if (i % B_STEPS.length === 0 && Date.now() >= endAt) {
      bStop();
      $("b-label").textContent = "做完了。你剛剛好好照顧了自己。";
      $("b-left").textContent = "";
      $("b-again").hidden = false;
      return;
    }
    const [label, sec, size] = B_STEPS[i % B_STEPS.length];
    const orb = $("b-orb");
    orb.style.transition = `transform ${sec}s ease-in-out`;
    orb.style.transform = `scale(${size})`;
    $("b-label").textContent = label;
    bTimer = setTimeout(() => bStep(i + 1, endAt), sec * 1000);
  };
  const bStart = () => {
    bStop();
    $("b-again").hidden = true;
    const endAt = Date.now() + (B_TOTAL - 1) * 1000;
    const tick = () => { $("b-left").textContent = "還有 " + bLeft(Math.max(0, Math.ceil((endAt - Date.now()) / 1000))); };
    tick();
    bTick = setInterval(tick, 1000);
    bStep(0, endAt);
  };
  $("b-open").addEventListener("click", () => { $("b-dlg").showModal(); bStart(); });
  $("b-again").addEventListener("click", bStart);
  $("b-close").addEventListener("click", () => { $("b-dlg").close(); bStop(); });
  $("b-dlg").addEventListener("close", bStop);

  const renderData = () => { renderProgress(); renderReview(); };
  addEventListener("data-changed", renderData);
  renderLetterForm();
  renderData();
}
