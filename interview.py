"""漸進式訪談。保留本人原話、記憶與資料出處，不把印象換成統計。"""
import uuid

def question(key, title, hint, options=None):
    return dict(key=key,title=title,hint=hint,options=options or [])
SECTIONS=[
 dict(id='offer',title='你賣的價值',intro='先把商品、賺錢方式和能承接的量說具體。',questions=[
  question('offer','客人付錢買到什麼？','挑最常賣的一項：包含什麼、解決什麼情境、通常多久完成。'),
  question('economics','價格、主要成本與產能怎麼抓？','例如：每組 1,500 元、材料約 300 元；一天最多接 4 組。沒有帳，先說你記得的。'),
  question('difference','客人為什麼最後選你？','想一位最近真的成交的客人。他說過哪句話？不要只填「品質好」。')]),
 dict(id='customer',title='你想留住的人',intro='從一個真實的人說起，比抽象的客群輪廓更有用。',questions=[
  question('ideal','哪種客人最適合你？','他的使用情境、預算、常出現在哪裡；也說說哪種需求你不想接。'),
  question('recent','帶我走過一位你最滿意的客人的故事','他怎麼找到你 → 第一次來發生什麼 → 為什麼一直回來 → 有沒有帶誰來。'),
  question('relationship','你現在怎麼記住客人？','有哪些欄位、放在哪、誰更新？只靠記憶也可以直說。',['LINE 對話','表格或名單','Notion／CRM','主要記在腦中'])]),
 dict(id='find',title='找客｜怎麼被找到',intro='分開「有曝光」和「真的帶來合適的詢問」。',questions=[
  question('channels','客人通常從哪裡來？','把你知道的管道排出先後；有數字就附期間，沒有就描述最近的例子。',['Google 地圖','熟客介紹','社群內容','街區／實體','主動找合作']),
  question('acquisition','最近一次找新客，你具體做了什麼？','說清楚對象、動作、投入的時間／錢、得到什麼反應。'),
  question('find_gap','找客最卡在哪一步？','找不到對的人、對方沒回、來的不是目標客，還是沒時間維持？')]),
 dict(id='welcome',title='迎客｜第一次互動',intro='把一段常見詢問還原，才能看出真正卡住的位置。',questions=[
  question('inquiry','客人會在哪裡、怎麼開口問？','可以直接貼最近一段去識別化的詢問；沒有紀錄，回想一句原話。'),
  question('response','你通常怎麼回？多久回？','誰回、先問什麼、會給什麼資料？晚上與忙碌時怎麼辦？'),
  question('welcome_gap','哪種詢問最容易停住？','給一個「問完就不見」的例子，你當時最後一句回了什麼？')]),
 dict(id='convert',title='成交｜從有興趣到付錢',intro='把實際步驟拆開，先不急著決定要用什麼工具。',questions=[
  question('sales_steps','從詢問到成交，實際要經過哪幾步？','例如：問用途 → 提供兩個方案 → 看檔期 → 收訂金 → 確認。'),
  question('objection','客人最常猶豫什麼？','價格、時間、效果、信任？你怎麼知道是這個原因？'),
  question('numbers','哪些數字你有記，哪些只記得大概？','附相同期間：詢問幾人、確認幾人、實際付款幾人。只知道一端就說一端。')]),
 dict(id='after',title='口碑・養客・回客',intro='成交後的三段分開看；一位熟客的故事也算重要材料。',questions=[
  question('wordofmouth','口碑｜滿意的客人怎麼幫你介紹？','什麼時機請回饋？評論、轉介、作品分享各怎麼做？目前沒做也記下來。'),
  question('nurture','養客｜兩次購買中間怎麼保持關係？','你會提供什麼有用的訊息？誰整理、多久一次、客人能不能選擇不收？'),
  question('return','回客｜什麼訊號表示他可能再需要你？','使用週期、季節、紀念日、主動詢問？舉一個最近回來或沒再回來的人。')]),
 dict(id='capacity',title='怎麼做才撐得住',intro='把時間、人手、資料和不想做的事一起算進來。',questions=[
  question('tools','現在用了哪些工具、各管哪一段？','列出表格、預約、收款、POS、Notion、社群；哪些資料有，哪些能匯出？'),
  question('owner','誰做什麼？你一週能花多少時間？','說出真的可用的空檔，以及一定得由本人判斷的事。'),
  question('boundaries','哪些做法你不想採用？','例如：不打折、不打陌生電話、不每天拍片；也寫下資料不能怎麼用。')]),
 dict(id='direction',title='先做好哪一件事',intro='收斂第一輪目標，保留其他問題，之後再逐步推進。',questions=[
  question('success','接下來一段時間，怎樣算有進步？','寫明期間、想改變的現象、能接受的投入；數字目標可以先標成你的期望。'),
  question('experiment','先試哪一條流程？怎麼知道有用？','先選一段，不確定可填「需要一起判斷」；記下觀察方式與停下來的條件。'),
  question('home','每天打開，最想先看什麼？','哪些數字、待回覆、待判斷、地圖或結果？請排出前後。',['營收與變化','今天待辦','客人卡在哪','合作地圖','昨天做完的結果'])]),
]
QUESTIONS={q['key']:q for sec in SECTIONS for q in sec['questions']}

def save(s, data, clock):
    index=int(data.get('section',0))
    if not 0<=index<len(SECTIONS):raise ValueError('訪談段落不符。')
    allowed={q['key'] for q in SECTIONS[index]['questions']}
    values=data.get('answers',{})
    if not isinstance(values,dict) or set(values)-allowed:raise ValueError('請只保存目前段落的回答。')
    interview=s.setdefault('interview',{'section':0,'answers':{}})
    source_id=uuid.uuid4().hex[:12]; lines=[]; saved={}
    for key,v in values.items():
        if not isinstance(v,dict):raise ValueError('回答格式不符。')
        text=str(v.get('text','')).strip()[:5000];basis=v.get('basis')
        if basis not in {'record','memory','unknown'}:raise ValueError('請標示這份回答來自紀錄、記憶或暫時不知道。')
        if not text and basis!='unknown':
            if data.get('advance'):raise ValueError('沒有內容的題目，請選「還不知道」，或先保存稍後接續。')
            continue
        answer={'text':text,'basis':basis,'source':source_id,'confirmed':True}
        if all(interview['answers'].get(key,{}).get(k)==answer[k] for k in ('text','basis','confirmed')):continue
        saved[key]=answer
        lines.append(f"{QUESTIONS[key]['title']}\n依據：{ {'record':'本人提供的紀錄','memory':'本人回憶，尚未對帳','unknown':'尚未取得'}[basis]}\n{text or '尚未取得'}")
    if saved:
        s['sources'].append(dict(id=source_id,name='訪談・'+SECTIONS[index]['title'],kind='interview',content='\n\n'.join(lines),at=clock,demo=bool(s.get('business',{}).get('demo'))))
        interview['answers'].update(saved)
    interview['section']=min(index+1,len(SECTIONS)-1) if data.get('advance') else index
    if data.get('advance') and index==len(SECTIONS)-1:interview['reviewed_at']=clock
    return s

def suggest(s, entries):
    ids={x['id'] for x in s['sources']};answers=s.setdefault('interview',{'section':0,'answers':{}})['answers']
    for key,value in entries.items():
        if key not in QUESTIONS or value.get('source') not in ids or value.get('basis') not in {'record','memory','unknown'}:raise ValueError('訪談預填需要有效題目、依據類型與現有來源。')
        if answers.get(key,{}).get('confirmed'):continue
        answers[key]={'text':str(value.get('text',''))[:5000],'basis':value['basis'],'source':value['source'],'confirmed':False}
