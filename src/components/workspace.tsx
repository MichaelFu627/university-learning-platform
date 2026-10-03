'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  BookOpen,
  LayoutDashboard,
  FolderOpen,
  MessagesSquare,
  CalendarDays,
  BrainCircuit,
  Settings2,
  Plus,
  ArrowUpRight,
  ArrowRight,
  Search,
  Bell,
  X,
  Upload,
  FileText,
  Check,
  CheckCircle2,
  Circle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Sparkles,
  Clock3,
  Trash2,
  Download,
  RefreshCw,
  Send,
  SlidersHorizontal,
  GraduationCap,
  AlertCircle,
  Pencil,
  ExternalLink,
  Menu,
  Leaf,
  Target,
  Zap,
} from 'lucide-react';
import { DateTime } from 'luxon';
import type {
  Snapshot,
  Course,
  Document,
  Topic,
  Assignment,
  Question,
  Message,
  Citation,
} from '@/lib/types';
import { weekPlan } from '@/lib/learning';
type Tab = 'overview' | 'courses' | 'files' | 'chat' | 'calendar' | 'practice' | 'settings';
const navigation: [Tab, string, typeof BookOpen][] = [
  ['overview', '学习总览', LayoutDashboard],
  ['courses', '我的课程', BookOpen],
  ['files', '课件资料', FolderOpen],
  ['chat', '课程问答', MessagesSquare],
  ['calendar', '学习日历', CalendarDays],
  ['practice', '知识点练习', BrainCircuit],
];
const colors = ['#32695c', '#687bb0', '#b67c51', '#946c95', '#b16e72', '#528e9b'];
async function api<T>(url: string, body?: unknown, method = body ? 'POST' : 'GET'): Promise<T> {
  const res = await fetch(`/api/${url}`, {
    method,
    headers:
      body instanceof FormData
        ? undefined
        : body
          ? { 'Content-Type': 'application/json' }
          : undefined,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}
const dateLabel = (date: string, zone: string, fmt = 'LLL d 日 HH:mm') =>
  DateTime.fromISO(date).setZone(zone).setLocale('zh-CN').toFormat(fmt);
function dueLabel(date: string, now: number) {
  const h = (Date.parse(date) - now) / 3600000;
  return h < 0
    ? `逾期 ${Math.max(1, Math.ceil(-h / 24))} 天`
    : h < 1
      ? '不足 1 小时'
      : h < 24
        ? `剩余 ${Math.ceil(h)} 小时`
        : `剩余 ${Math.ceil(h / 24)} 天`;
}
function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'wide' : ''}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="关闭">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Empty({
  icon: Icon = BookOpen,
  title,
  body,
  action,
}: {
  icon?: typeof BookOpen;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span>
        <Icon size={28} />
      </span>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}
function Submit({ busy, children = '保存' }: { busy: boolean; children?: ReactNode }) {
  return (
    <button className="button primary" disabled={busy} type="submit">
      {busy ? <Loader2 size={17} className="spin" /> : <Check size={17} />} {children}
    </button>
  );
}
export default function Workspace() {
  const [state, setState] = useState<Snapshot | null>(null),
    [tab, setTab] = useState<Tab>('overview'),
    [course, setCourse] = useState('all'),
    [search, setSearch] = useState(''),
    [clock, setClock] = useState(Date.now()),
    [error, setError] = useState(''),
    [toast, setToast] = useState(''),
    [busy, setBusy] = useState(false),
    [mobile, setMobile] = useState(false);
  const [courseForm, setCourseForm] = useState<Course | 'new' | null>(null),
    [assignmentForm, setAssignmentForm] = useState<Assignment | 'new' | null>(null),
    [topicForm, setTopicForm] = useState<Topic | 'new' | null>(null),
    [preview, setPreview] = useState<{ doc: Document; page: number } | null>(null),
    [notices, setNotices] = useState(false),
    [uploading, setUploading] = useState(false);
  const [confirm, setConfirm] = useState<{ title: string; action: () => Promise<unknown> } | null>(
    null,
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = useCallback(async () => {
    try {
      setState(await api<Snapshot>('state'));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const t = setInterval(() => {
      setClock(Date.now());
      void refresh();
    }, 10000);
    return () => clearInterval(t);
  }, [refresh]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const act = async (fn: () => Promise<unknown>, message = '已保存') => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await refresh();
      if (message) setToast(message);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const go = (next: Tab) => {
    setTab(next);
    setSearch('');
    setMobile(false);
  };
  const selectCourse = (c: Course) => {
    setCourse(c.id);
    go('files');
  };
  const showCitation = (c: Citation) => {
    const doc = state?.documents.find((d) => d.id === c.documentId);
    if (doc) setPreview({ doc, page: c.page });
  };
  const filterCourse = <T extends { course_id: string }>(items: T[]) =>
    items.filter((x) => course === 'all' || x.course_id === course);
  const matched = (s: string) => s.toLowerCase().includes(search.toLowerCase());
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    if (course === 'all') {
      setError('请先在顶部选择一门课程，再上传课件。');
      return;
    }
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.set('course_id', course);
        form.set('file', file);
        await api('documents', form);
      }
      setToast('课件已上传，后台正在解析。');
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  if (!state)
    return (
      <div className="boot">
        <GraduationCap size={42} />
        <h1>
          UniStudy<span>.</span>
        </h1>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button className="button" onClick={refresh}>
              重试连接
            </button>
          </>
        ) : (
          <>
            <Loader2 className="spin" />
            <p>正在打开你的学习空间…</p>
          </>
        )}
      </div>
    );
  const zone = state.settings.timezone;
  const courses = state.courses.filter((c) => matched(c.name + ' ' + c.code));
  const docs = filterCourse(state.documents).filter((d) => matched(d.name));
  const topics = filterCourse(state.topics).filter((t) => matched(t.title));
  const assignments = filterCourse(state.assignments),
    pending = assignments.filter((a) => !a.completed);
  const weak = topics.filter((t) => t.mastery?.status === 'review' || t.mastery?.due);
  const today = DateTime.fromMillis(clock).setZone(zone).setLocale('zh-CN');
  const countUnread = state.notices.filter((n) => !n.read).length;
  const workerOnline =
    state.settings.workerLastSeen && clock - Date.parse(state.settings.workerLastSeen) < 90000;
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? 'visible' : ''}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go('overview');
          }}
        >
          <span className="brand-icon">
            <GraduationCap size={24} />
          </span>
          UniStudy<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">
          <span className="personal-icon">我</span>
          <div>
            我的学习空间<small>个人试用版</small>
          </div>
          <span className="live-dot" />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {navigation.map(([id, label, Icon]) => (
            <button
              key={id}
              className={`nav-item ${tab === id ? 'active' : ''}`}
              onClick={() => go(id)}
            >
              <Icon size={19} />
              {label}
              {id === 'practice' && weak.length > 0 && <b>{weak.length}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-courses">
          <div className="nav-label">
            我的课程{' '}
            <button className="icon-btn" aria-label="添加课程" onClick={() => setCourseForm('new')}>
              <Plus size={15} />
            </button>
          </div>
          {state.courses.slice(0, 5).map((c) => (
            <button key={c.id} className="mini-course" onClick={() => selectCourse(c)}>
              <i style={{ background: c.color }} />
              {c.code || c.name}
            </button>
          ))}
          {!state.courses.length && <p>从你的第一门课开始</p>}
        </div>
        <div className="sidebar-bottom">
          <div className="quiet-card">
            <Leaf size={20} />
            <p>
              一点点积累，
              <br />
              让理解真正发生。
            </p>
            <small>MAKE ROOM TO LEARN</small>
          </div>
          <button
            className={`nav-item ${tab === 'settings' ? 'active' : ''}`}
            onClick={() => go('settings')}
          >
            <Settings2 size={19} />
            偏好与连接
          </button>
          <div className="local-status">
            <span className={`live-dot ${workerOnline ? '' : 'offline'}`} />
            {workerOnline ? '本地工作台已就绪' : '后台任务未连接'}
          </div>
        </div>
      </aside>
      {mobile && (
        <button className="sidebar-scrim" aria-label="关闭菜单" onClick={() => setMobile(false)} />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-btn mobile-menu"
              aria-label="打开菜单"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </button>
            <span>我的工作台</span>
            <span>/</span>
            <strong>
              {tab === 'settings' ? '偏好与连接' : navigation.find((n) => n[0] === tab)?.[1]}
            </strong>
          </div>
          <div className="top-actions">
            <span className="date-chip">{today.toFormat('M 月 d 日 · cccc')}</span>
            <button
              className="notification-btn icon-btn"
              aria-label="查看提醒"
              onClick={() => setNotices(true)}
            >
              <Bell size={19} />
              {countUnread > 0 && <i />}
            </button>
            <span className="avatar">我</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR PERSONAL LEARNING SPACE</div>
              <h1>
                {tab === 'overview'
                  ? '把学习，安排得从容一点。'
                  : tab === 'courses'
                    ? '每一门课，都有自己的空间。'
                    : tab === 'files'
                      ? '知识，从一份课件开始。'
                      : tab === 'chat'
                        ? '带着问题，回到知识本身。'
                        : tab === 'calendar'
                          ? '看见安排，也留出余地。'
                          : tab === 'practice'
                            ? '不止看懂，还要真正掌握。'
                            : '让工作台适合你的节奏。'}
              </h1>
              <p>
                {tab === 'overview'
                  ? '课程、截止日期与薄弱知识点，都在这里。'
                  : tab === 'files'
                    ? '上传、预览和检索课程资料，保留每一条知识的出处。'
                    : tab === 'chat'
                      ? '选择课程提问，答案与你的课件相连。'
                      : tab === 'calendar'
                        ? '统一查看多门课程，提前发现时间不够用的地方。'
                        : tab === 'practice'
                          ? '从五个难度理解同一知识点，用作答积累掌握证据。'
                          : tab === 'settings'
                            ? '数据保存在本机，模型和邮件按需连接。'
                            : '整理你的学期，让资料和进度各归其位。'}
              </p>
            </div>
            <div className="heading-actions">
              {tab === 'courses' || tab === 'overview' ? (
                <button className="button primary" onClick={() => setCourseForm('new')}>
                  <Plus size={17} />
                  新建课程
                </button>
              ) : tab === 'files' ? (
                <button
                  className="button primary"
                  disabled={uploading || !state.courses.length}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? <Loader2 className="spin" size={17} /> : <Upload size={17} />}
                  上传课件
                </button>
              ) : tab === 'calendar' ? (
                <button
                  className="button primary"
                  disabled={!state.courses.length}
                  onClick={() => setAssignmentForm('new')}
                >
                  <Plus size={17} />
                  添加作业
                </button>
              ) : tab === 'practice' ? (
                <button
                  className="button primary"
                  disabled={!state.documents.length}
                  onClick={() => setTopicForm('new')}
                >
                  <Plus size={17} />
                  添加知识点
                </button>
              ) : null}
            </div>
          </div>
          <input
            type="file"
            ref={fileRef}
            className="sr-only"
            multiple
            accept=".pdf,.ppt,.pptx,.docx,.txt,.md,.png,.jpg,.jpeg,.webp"
            onChange={(e) => upload(e.target.files)}
          />
          {error && (
            <div className="alert error" role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
              <button className="icon-btn" onClick={() => setError('')} aria-label="关闭错误">
                <X size={16} />
              </button>
            </div>
          )}
          {!workerOnline && (
            <div className="alert warning">
              <Clock3 size={18} />
              <span>
                后台任务尚未连接。请用 npm run dev 或 npm start
                启动完整应用，解析和邮件提醒需要后台进程持续运行。
              </span>
            </div>
          )}
          {tab !== 'settings' && tab !== 'courses' && (
            <div className="toolbar">
              <div className="filter-select">
                <SlidersHorizontal size={16} />
                <select
                  aria-label="筛选课程"
                  value={course}
                  onChange={(e) => setCourse(e.target.value)}
                >
                  <option value="all">全部课程</option>
                  {state.courses.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.code ? c.code + ' · ' : ''}
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              {['files', 'practice', 'overview'].includes(tab) && (
                <label className="search-box">
                  <Search size={17} />
                  <input
                    placeholder={
                      tab === 'files'
                        ? '查找课件…'
                        : tab === 'practice'
                          ? '查找知识点…'
                          : '查找课程…'
                    }
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              )}
              <span className="toolbar-right">
                {tab === 'files'
                  ? `${docs.length} 份资料`
                  : tab === 'practice'
                    ? `${topics.length} 个知识点`
                    : zone}
              </span>
            </div>
          )}
          {tab === 'overview' && (
            <>
              <section className="stat-grid">
                <Stat
                  label="正在学习"
                  number={course === 'all' ? state.courses.length : 1}
                  unit="门课程"
                  icon={BookOpen}
                  tone="green"
                />
                <Stat
                  label="待完成任务"
                  number={pending.length}
                  unit="项作业"
                  icon={CalendarDays}
                  tone="orange"
                />
                <Stat
                  label="知识点积累"
                  number={topics.length}
                  unit="个知识点"
                  icon={BrainCircuit}
                  tone="purple"
                />
                <Stat
                  label="需要回顾"
                  number={weak.length}
                  unit="个薄弱 / 到期"
                  icon={Target}
                  tone="pink"
                />
              </section>
              {!state.courses.length && (
                <div className="welcome-panel">
                  <div>
                    <span className="pill">从今天开始</span>
                    <h2>欢迎来到你的学习工作台</h2>
                    <p>
                      创建一门课程，上传第一份课件。
                      <br />
                      也可以先用示例课程，体验一次完整的学习流程。
                    </p>
                    <div className="row">
                      <button className="button primary" onClick={() => setCourseForm('new')}>
                        <Plus size={16} />
                        创建第一门课
                      </button>
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() =>
                          act(() => api('demo', {}), '示例课程已加入，可进入练习体验。')
                        }
                      >
                        <Sparkles size={16} />
                        载入示例
                      </button>
                    </div>
                  </div>
                  <div className="welcome-art" aria-hidden="true">
                    <BookOpen size={95} strokeWidth={1} />
                    <span className="art-star">✦</span>
                    <span className="art-line" />
                  </div>
                </div>
              )}
              <div className="overview-grid">
                <section>
                  <SectionTitle
                    title="我的课程"
                    subtitle="把注意力放回每一次理解"
                    action={
                      <button className="text-button" onClick={() => go('courses')}>
                        查看全部 <ArrowRight size={15} />
                      </button>
                    }
                  />
                  <div className="course-grid">
                    {courses
                      .filter((c) => course === 'all' || c.id === course)
                      .slice(0, 4)
                      .map((c) => (
                        <CourseCard
                          key={c.id}
                          course={c}
                          topics={state.topics.filter((t) => t.course_id === c.id)}
                          onOpen={() => selectCourse(c)}
                        />
                      ))}
                    {state.courses.length > 0 && courses.length === 0 && (
                      <p className="muted">没有找到匹配课程。</p>
                    )}
                  </div>
                  <SectionTitle title="接下来，巩固这些知识" subtitle="先照顾需要复习的地方" />
                  {weak.length ? (
                    <div className="panel">
                      {weak.slice(0, 4).map((t) => (
                        <button
                          className="topic-row"
                          key={t.id}
                          onClick={() => {
                            setCourse(t.course_id);
                            go('practice');
                          }}
                        >
                          <span className={`status-dot ${t.mastery?.status}`} />
                          <div>
                            <strong>{t.title}</strong>
                            <small>{t.course_name}</small>
                          </div>
                          <span className="pill danger">
                            {t.mastery?.due ? '复习到期' : t.mastery?.label}
                          </span>
                          <ArrowUpRight size={17} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="small-empty">
                      <CheckCircle2 size={22} />
                      <div>
                        目前没有待复习提醒
                        <small>
                          {topics.length
                            ? '完成练习后，这里会呈现你的薄弱点。'
                            : '上传课件并添加知识点，让学习进度逐渐清晰。'}
                        </small>
                      </div>
                    </div>
                  )}
                </section>
                <aside className="agenda-panel">
                  <SectionTitle
                    title="近期截止"
                    subtitle="提前一点，更从容一点"
                    action={
                      <button
                        className="icon-btn"
                        aria-label="打开日历"
                        onClick={() => go('calendar')}
                      >
                        <ArrowUpRight size={18} />
                      </button>
                    }
                  />
                  {pending.slice(0, 5).map((a) => (
                    <div className="agenda-item" key={a.id}>
                      <span className="agenda-course" style={{ color: a.color }}>
                        {a.course_name}
                      </span>
                      <button onClick={() => setAssignmentForm(a)}>{a.title}</button>
                      <div>
                        <span>{dateLabel(a.due_at, zone, 'M/d HH:mm')}</span>
                        <span className={Date.parse(a.due_at) - clock < 86400000 ? 'urgent' : ''}>
                          {dueLabel(a.due_at, clock)}
                        </span>
                      </div>
                    </div>
                  ))}
                  {!pending.length && (
                    <div className="agenda-empty">
                      <CalendarDays size={30} />
                      <p>日程暂时很轻盈</p>
                      <small>添加作业后，我们会帮你关注截止时间。</small>
                    </div>
                  )}
                  <button
                    className="button full"
                    disabled={!state.courses.length}
                    onClick={() => setAssignmentForm('new')}
                  >
                    <Plus size={16} />
                    添加一项作业
                  </button>
                  <div className="agenda-note">
                    <Clock3 size={17} />
                    <p>
                      现在是 {today.toFormat('HH:mm')}
                      <small>{zone}</small>
                    </p>
                  </div>
                </aside>
              </div>
            </>
          )}
          {tab === 'courses' && (
            <>
              <div className="toolbar">
                <label className="search-box">
                  <Search size={17} />
                  <input
                    placeholder="搜索课程名称或代码…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <span className="toolbar-right">{state.courses.length} 门课程</span>
              </div>
              <div className="course-grid all-courses">
                {courses.map((c) => (
                  <div key={c.id}>
                    <CourseCard
                      course={c}
                      topics={state.topics.filter((t) => t.course_id === c.id)}
                      onOpen={() => selectCourse(c)}
                    />
                    <div className="card-foot-actions">
                      <button className="text-button" onClick={() => setCourseForm(c)}>
                        <Pencil size={13} />
                        编辑
                      </button>
                      <button
                        className="text-button danger-text"
                        onClick={() =>
                          setConfirm({
                            title: `删除「${c.name}」及其课件、题目和学习记录？`,
                            action: async () => {
                              await api(`courses/${c.id}`, undefined, 'DELETE');
                              if (course === c.id) setCourse('all');
                            },
                          })
                        }
                      >
                        <Trash2 size={13} />
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {!courses.length && (
                <Empty
                  title="还没有课程"
                  body="用课程名称和代码，建立你的第一个学习空间。"
                  action={
                    <button className="button primary" onClick={() => setCourseForm('new')}>
                      <Plus size={16} />
                      新建课程
                    </button>
                  }
                />
              )}
            </>
          )}
          {tab === 'files' && (
            <>
              <div
                className={`upload-zone ${uploading ? 'uploading' : ''}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void upload(e.dataTransfer.files);
                }}
              >
                <span className="upload-icon">
                  <Upload size={26} />
                </span>
                <div>
                  <strong>{uploading ? '正在上传课件…' : '把课件拖到这里，开始整理知识'}</strong>
                  <p>PDF、PPT / PPTX、DOCX、TXT / Markdown、图片 · 单文件最大 25 MB</p>
                  <small>
                    {course === 'all'
                      ? '先在上方选择所属课程。'
                      : 'PDF 和文字自动入库；扫描页及图片暂不进行 OCR。'}
                  </small>
                </div>
                <button
                  className="button"
                  disabled={uploading || !state.courses.length}
                  onClick={() => fileRef.current?.click()}
                >
                  选择文件
                </button>
              </div>
              <div className="panel files-panel">
                <div className="table-head">
                  <span>文件名称</span>
                  <span>课程 / 页数</span>
                  <span>处理状态</span>
                  <span>操作</span>
                </div>
                {docs.map((d) => (
                  <div className="file-row" key={d.id}>
                    <button className="file-name" onClick={() => setPreview({ doc: d, page: 1 })}>
                      <span className={`file-icon ${d.extension === 'pdf' ? 'pdf' : ''}`}>
                        <FileText size={23} />
                        <small>{d.extension.toUpperCase()}</small>
                      </span>
                      <div>
                        <strong>{d.name}</strong>
                        <small>
                          {(d.size / 1024).toFixed(0)} KB · {dateLabel(d.created_at, zone, 'M/d')}{' '}
                          上传
                        </small>
                      </div>
                    </button>
                    <div className="file-meta">
                      {d.course_name}
                      <small>
                        {d.page_count || '—'} 页 · {d.chunk_count || 0} 个片段
                      </small>
                    </div>
                    <div>
                      <span
                        className={`pill ${d.status === 'ready' ? 'success' : d.status === 'failed' ? 'danger' : ''}`}
                      >
                        {(
                          {
                            queued: '排队中',
                            processing: '解析中',
                            ready: '已入库',
                            failed: '解析失败',
                            preview_only: '仅预览',
                          } as Record<string, string>
                        )[d.status] || d.status}
                      </span>
                      {d.error && (
                        <small className="file-warning" title={d.error}>
                          {d.error}
                        </small>
                      )}
                    </div>
                    <div className="file-actions">
                      <button
                        className="icon-btn"
                        title="提取知识点候选"
                        aria-label={`提取 ${d.name} 的知识点`}
                        disabled={busy || d.status !== 'ready'}
                        onClick={() =>
                          act(
                            () => api(`documents/${d.id}/discover`, {}),
                            '知识点提取任务已加入队列。',
                          )
                        }
                      >
                        <Sparkles size={17} />
                      </button>
                      <button
                        className="icon-btn"
                        aria-label={`重新解析 ${d.name}`}
                        disabled={d.status === 'processing' || d.status === 'queued'}
                        onClick={() =>
                          act(() => api(`documents/${d.id}/reindex`, {}), '已加入重新解析队列。')
                        }
                      >
                        <RefreshCw size={16} />
                      </button>
                      <button
                        className="icon-btn"
                        aria-label={`删除 ${d.name}`}
                        onClick={() =>
                          setConfirm({
                            title: `删除「${d.name}」及关联知识点和练习？`,
                            action: () => api(`documents/${d.id}`, undefined, 'DELETE'),
                          })
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
                {!docs.length && (
                  <Empty
                    icon={FolderOpen}
                    title="给知识找一个位置"
                    body="上传课件后，可以预览原文、提问，或提取知识点。"
                  />
                )}
              </div>
              <p className="footnote">
                自动提取的知识点是待确认候选，每次最多 12
                个；长课件采用抽样，不代表完整覆盖。你可以在练习页补充或编辑。
              </p>
              <Jobs jobs={state.jobs} />
            </>
          )}
          {tab === 'chat' && (
            <ChatView
              courseId={course === 'all' ? state.courses[0]?.id : course}
              courseName={
                state.courses.find(
                  (c) => c.id === (course === 'all' ? state.courses[0]?.id : course),
                )?.name
              }
              aiConfigured={state.settings.aiConfigured}
              onError={setError}
              onCitation={showCitation}
              onRefresh={refresh}
            />
          )}
          {tab === 'calendar' && (
            <CalendarView
              assignments={assignments}
              zone={zone}
              clock={clock}
              dailyHours={state.settings.dailyHours}
              onEdit={setAssignmentForm}
              onToggle={(a) =>
                act(
                  () => api(`assignments/${a.id}`, { completed: !a.completed }, 'PATCH'),
                  '任务状态已更新。',
                )
              }
              onDelete={(a) =>
                setConfirm({
                  title: `删除作业「${a.title}」？`,
                  action: () => api(`assignments/${a.id}`, undefined, 'DELETE'),
                })
              }
            />
          )}
          {tab === 'practice' && (
            <>
              <PracticeView
                topics={topics}
                act={act}
                onEdit={setTopicForm}
                onDelete={(t) =>
                  setConfirm({
                    title: `删除知识点「${t.title}」及其题目和记录？`,
                    action: () => api(`topics/${t.id}`, undefined, 'DELETE'),
                  })
                }
                onError={setError}
                onCitation={(t) => {
                  const doc = state.documents.find((d) => d.id === t.document_id);
                  if (doc) setPreview({ doc, page: t.source_page });
                }}
              />
              <Jobs jobs={state.jobs.filter((j) => j.kind !== 'ingest')} />
            </>
          )}
          {tab === 'settings' && <SettingsView state={state} busy={busy} act={act} />}
          <footer>
            UniStudy <span>·</span> 少一点忙乱，多一点理解。
            <span className="footer-right">个人本地版 · v0.1</span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      {courseForm && (
        <Modal
          title={courseForm === 'new' ? '创建一门课程' : '编辑课程'}
          subtitle="为这个学期的知识留出一个位置。"
          onClose={() => setCourseForm(null)}
        >
          <CourseForm
            course={courseForm}
            busy={busy}
            onSave={async (values) => {
              const ok = await act(() =>
                api(
                  courseForm === 'new' ? 'courses' : `courses/${courseForm.id}`,
                  values,
                  courseForm === 'new' ? 'POST' : 'PATCH',
                ),
              );
              if (ok) setCourseForm(null);
            }}
          />
        </Modal>
      )}
      {assignmentForm && (
        <Modal
          title={assignmentForm === 'new' ? '添加作业 / 考试' : '编辑截止与工作量'}
          onClose={() => setAssignmentForm(null)}
        >
          <AssignmentForm
            assignment={assignmentForm}
            courses={state.courses}
            courseId={course}
            zone={zone}
            busy={busy}
            onSave={async (values) => {
              const ok = await act(() =>
                api(
                  assignmentForm === 'new' ? 'assignments' : `assignments/${assignmentForm.id}`,
                  values,
                  assignmentForm === 'new' ? 'POST' : 'PATCH',
                ),
              );
              if (ok) setAssignmentForm(null);
            }}
          />
        </Modal>
      )}
      {topicForm && (
        <Modal
          title={topicForm === 'new' ? '添加知识点' : '确认并编辑知识点'}
          subtitle="描述一个可以通过练习检验的学习目标。"
          onClose={() => setTopicForm(null)}
        >
          <TopicForm
            topic={topicForm}
            documents={state.documents}
            courseId={course}
            busy={busy}
            onSave={async (values) => {
              const ok = await act(() =>
                api(
                  topicForm === 'new' ? 'topics' : `topics/${topicForm.id}`,
                  values,
                  topicForm === 'new' ? 'POST' : 'PATCH',
                ),
              );
              if (ok) setTopicForm(null);
            }}
          />
        </Modal>
      )}
      {preview && (
        <Preview doc={preview.doc} page={preview.page} onClose={() => setPreview(null)} />
      )}
      {confirm && (
        <Modal title="确认删除" onClose={() => setConfirm(null)}>
          <p className="confirm-text">{confirm.title}</p>
          <div className="form-actions">
            <button className="button" onClick={() => setConfirm(null)}>
              保留
            </button>
            <button
              className="button destructive"
              disabled={busy}
              onClick={async () => {
                if (await act(confirm.action, '已删除。')) setConfirm(null);
              }}
            >
              确认删除
            </button>
          </div>
        </Modal>
      )}
      {notices && (
        <Modal
          title="截止提醒"
          subtitle="由当前日期计算；邮件发送需要后台和 SMTP 配置。"
          onClose={() => setNotices(false)}
        >
          <div className="notice-list">
            {state.notices.map((n) => (
              <article key={n.id} className={n.read ? 'read' : ''}>
                <Bell size={18} />
                <div>
                  <strong>{n.title}</strong>
                  <p>{n.body}</p>
                  <small>
                    {dateLabel(n.created_at, zone)} ·{' '}
                    {n.email_status === 'sent'
                      ? '邮件已发送'
                      : n.email_status === 'failed'
                        ? '邮件发送失败'
                        : '站内提醒'}
                  </small>
                  {['failed', 'sending'].includes(n.email_status) && (
                    <button
                      className="text-button"
                      onClick={() =>
                        act(() => api(`notifications/${n.id}/retry`, {}), '邮件已加入重试队列。')
                      }
                    >
                      重试邮件
                    </button>
                  )}
                </div>
              </article>
            ))}
            {!state.notices.length && (
              <Empty
                icon={Bell}
                title="暂时没有提醒"
                body="截止前 7 天、3 天、24 小时、2 小时及逾期会生成提醒。"
              />
            )}
          </div>
          <button
            className="button full"
            onClick={() => act(() => api('notifications', {}, 'PATCH'), '已全部标记为已读。')}
          >
            <Check size={16} />
            全部标为已读
          </button>
        </Modal>
      )}
    </div>
  );
}
function Stat({
  label,
  number,
  unit,
  icon: Icon,
  tone,
}: {
  label: string;
  number: number;
  unit: string;
  icon: typeof BookOpen;
  tone: string;
}) {
  return (
    <article className="stat-card">
      <span className={`stat-icon ${tone}`}>
        <Icon size={20} />
      </span>
      <p>{label}</p>
      <div>
        <strong>{String(number).padStart(2, '0')}</strong>
        <span>{unit}</span>
      </div>
    </article>
  );
}
function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
function CourseCard({
  course: c,
  topics,
  onOpen,
}: {
  course: Course;
  topics: Topic[];
  onOpen: () => void;
}) {
  const done = topics.filter((t) =>
    ['provisional', 'secure'].includes(t.mastery?.status || ''),
  ).length;
  const pct = topics.length ? Math.round((done / topics.length) * 100) : 0;
  return (
    <button
      className="course-card"
      onClick={onOpen}
      style={{ '--course-color': c.color } as React.CSSProperties}
    >
      <div className="course-top">
        <span className="course-symbol">
          <BookOpen size={22} />
        </span>
        <span className="course-code">{c.code || 'COURSE'}</span>
        <ArrowUpRight size={17} />
      </div>
      <h3>{c.name}</h3>
      <p>{c.semester || '我的学期'}</p>
      <div className="course-numbers">
        <span>
          <FileText size={14} />
          {c.document_count || 0} 份资料
        </span>
        <span>
          <BrainCircuit size={14} />
          {topics.length} 个知识点
        </span>
      </div>
      <div className="progress-caption">
        <span>初步掌握及以上</span>
        <strong>{topics.length ? `${pct}%` : '待评估'}</strong>
      </div>
      <div className="progress-track">
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="course-bottom">
        <span>{c.assignment_count || 0} 项待办</span>
        <span>
          进入课程 <ArrowRight size={14} />
        </span>
      </div>
    </button>
  );
}
function CourseForm({
  course,
  busy,
  onSave,
}: {
  course: Course | 'new';
  busy: boolean;
  onSave: (v: unknown) => void;
}) {
  const [color, setColor] = useState(course === 'new' ? colors[0] : course.color);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onSave({ name: f.get('name'), code: f.get('code'), semester: f.get('semester'), color });
      }}
      className="form"
    >
      <label>
        课程名称
        <input
          name="name"
          required
          maxLength={100}
          autoFocus
          defaultValue={course === 'new' ? '' : course.name}
          placeholder="例如：数据结构与算法"
        />
      </label>
      <div className="form-grid">
        <label>
          课程代码
          <input
            name="code"
            maxLength={24}
            defaultValue={course === 'new' ? '' : course.code}
            placeholder="COMP20003"
          />
        </label>
        <label>
          学期
          <input
            name="semester"
            maxLength={60}
            defaultValue={course === 'new' ? '' : course.semester}
            placeholder="2026 · Semester 2"
          />
        </label>
      </div>
      <label>课程颜色</label>
      <div className="color-options">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            style={{ background: c }}
            onClick={() => setColor(c)}
            aria-label={`选择颜色 ${c}`}
            aria-pressed={color === c}
          >
            {color === c && <Check size={18} />}
          </button>
        ))}
      </div>
      <div className="form-actions">
        <Submit busy={busy} />
      </div>
    </form>
  );
}
function AssignmentForm({
  assignment: a,
  courses,
  courseId,
  zone,
  busy,
  onSave,
}: {
  assignment: Assignment | 'new';
  courses: Course[];
  courseId: string;
  zone: string;
  busy: boolean;
  onSave: (v: unknown) => void;
}) {
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onSave({
          course_id: f.get('course_id'),
          title: f.get('title'),
          due_local: f.get('due_local'),
          timezone: f.get('timezone'),
          hours: Number(f.get('hours')),
          weight: Number(f.get('weight')),
          notes: f.get('notes'),
        });
      }}
    >
      <label>
        所属课程
        <select
          name="course_id"
          defaultValue={
            a === 'new' ? (courseId === 'all' ? courses[0]?.id : courseId) : a.course_id
          }
        >
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        作业 / 考试名称
        <input
          required
          name="title"
          maxLength={150}
          autoFocus
          defaultValue={a === 'new' ? '' : a.title}
          placeholder="例如：Assignment 1 · 实验报告"
        />
      </label>
      <div className="form-grid">
        <label>
          截止日期和时间
          <input
            required
            type="datetime-local"
            name="due_local"
            defaultValue={
              a === 'new'
                ? ''
                : DateTime.fromISO(a.due_at).setZone(a.timezone).toFormat("yyyy-MM-dd'T'HH:mm")
            }
          />
        </label>
        <label>
          截止时间所属时区
          <input required name="timezone" defaultValue={a === 'new' ? zone : a.timezone} />
        </label>
      </div>
      <div className="form-grid">
        <label>
          预计剩余小时
          <input
            name="hours"
            required
            type="number"
            min="0"
            max="500"
            step="0.5"
            defaultValue={a === 'new' ? 2 : a.hours}
          />
        </label>
        <label>
          课程成绩占比 %
          <input
            name="weight"
            required
            type="number"
            min="0"
            max="100"
            step="0.1"
            defaultValue={a === 'new' ? 0 : a.weight}
          />
        </label>
      </div>
      <label>
        备注 / 日期来源
        <textarea
          name="notes"
          rows={3}
          maxLength={2000}
          defaultValue={a === 'new' ? '' : a.notes}
          placeholder="记录老师的要求或日期来源…"
        />
      </label>
      <p className="help">截止时间由你确认，平台目前不会自动同步学校的延期通知。</p>
      <div className="form-actions">
        <Submit busy={busy} />
      </div>
    </form>
  );
}
function TopicForm({
  topic: t,
  documents,
  courseId,
  busy,
  onSave,
}: {
  topic: Topic | 'new';
  documents: Document[];
  courseId: string;
  busy: boolean;
  onSave: (v: unknown) => void;
}) {
  const docs = documents.filter((d) => courseId === 'all' || d.course_id === courseId);
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onSave({
          document_id: f.get('document_id'),
          title: f.get('title'),
          description: f.get('description'),
          source_page: Number(f.get('source_page')),
        });
      }}
    >
      {t === 'new' && (
        <>
          <label>
            来源课件
            <select name="document_id" required>
              {(docs.length ? docs : documents).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            来源页码
            <input type="number" name="source_page" required min="1" defaultValue="1" />
          </label>
        </>
      )}
      <label>
        知识点名称
        <input required name="title" maxLength={120} defaultValue={t === 'new' ? '' : t.title} />
      </label>
      <label>
        学习目标
        <textarea
          name="description"
          maxLength={1000}
          rows={4}
          defaultValue={t === 'new' ? '' : t.description}
          placeholder="学完后，你应该能够解释或完成什么？"
        />
      </label>
      <div className="form-actions">
        <Submit busy={busy}>确认知识点</Submit>
      </div>
    </form>
  );
}
function Jobs({ jobs }: { jobs: Snapshot['jobs'] }) {
  const active = jobs.filter((j) => ['queued', 'running', 'failed'].includes(j.status));
  return active.length ? (
    <details className="jobs">
      <summary>
        后台任务 · {active.filter((j) => j.status !== 'failed').length} 项进行中
        {active.some((j) => j.status === 'failed') ? ' · 有任务需要处理' : ''}
      </summary>
      {active.slice(0, 8).map((j) => (
        <p key={j.id}>
          <span className={`pill ${j.status === 'failed' ? 'danger' : ''}`}>
            {j.status === 'failed' ? '失败' : j.status === 'running' ? '处理中' : '等待'}
          </span>
          {
            (
              { ingest: '课件解析', discover: '提取知识点', questions: '生成练习题' } as Record<
                string,
                string
              >
            )[j.kind]
          }{' '}
          {j.error}
        </p>
      ))}
    </details>
  ) : null;
}
function Preview({ doc, page, onClose }: { doc: Document; page: number; onClose: () => void }) {
  const [pages, setPages] = useState<{ id: string; page: number; content: string }[]>([]),
    [err, setErr] = useState('');
  const pdf = doc.extension === 'pdf' || Boolean(doc.preview_path),
    image = ['png', 'jpg', 'jpeg', 'webp'].includes(doc.extension);
  useEffect(() => {
    if (!pdf && !image)
      api<{ pages: typeof pages }>(`documents/${doc.id}/content`)
        .then((r) => setPages(r.pages))
        .catch((e) => setErr(e.message));
  }, [doc.id, pdf, image]);
  return (
    <Modal
      wide
      title={doc.name}
      subtitle={`第 ${page} 页 · ${pdf ? 'PDF 预览' : image ? '原图预览' : '提取文字预览（不保留原排版）'}`}
      onClose={onClose}
    >
      <div className="preview-toolbar">
        <span>{doc.error || '原始资料保存在本机。'}</span>
        <a className="button" href={`/api/documents/${doc.id}/file?download=1`}>
          <Download size={15} />
          下载原件
        </a>
      </div>
      {pdf ? (
        <iframe
          title={doc.name}
          className="pdf-preview"
          src={`/api/documents/${doc.id}/file?preview=1#page=${page}`}
        />
      ) : image ? (
        <div className="image-preview">
          {/* Native images allow private local file routes. */}
          <img src={`/api/documents/${doc.id}/file`} alt={doc.name} />
        </div>
      ) : (
        <div className="text-preview">
          {err && <p>{err}</p>}
          {pages
            .filter((p) => p.page >= page)
            .map((p) => (
              <section key={p.id}>
                <span className="pill">第 {p.page} 页 / 段落</span>
                <pre>{p.content}</pre>
              </section>
            ))}
          {!pages.length && !err && <p>暂无可预览文字，可能仍在解析中。</p>}
        </div>
      )}
    </Modal>
  );
}
function ChatView({
  courseId,
  courseName,
  aiConfigured,
  onError,
  onCitation,
  onRefresh,
}: {
  courseId?: string;
  courseName?: string;
  aiConfigured: boolean;
  onError: (s: string) => void;
  onCitation: (c: Citation) => void;
  onRefresh: () => Promise<void>;
}) {
  const [messages, setMessages] = useState<Message[]>([]),
    [question, setQuestion] = useState(''),
    [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    if (courseId) setMessages(await api<Message[]>(`chat?course_id=${courseId}`));
    else setMessages([]);
  }, [courseId]);
  useEffect(() => {
    void load().catch((e) => onError(e.message));
  }, [load, onError]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages]);
  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!question.trim() || !courseId) return;
    setSending(true);
    try {
      await api('chat', { course_id: courseId, question });
      setQuestion('');
      await load();
      await onRefresh();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSending(false);
    }
  };
  if (!courseId)
    return (
      <Empty
        icon={MessagesSquare}
        title="先创建一门课程"
        body="问答始终在选定的课程资料中寻找证据。"
      />
    );
  return (
    <div className="chat-panel">
      <div className="chat-header">
        <span className="chat-avatar">
          <Sparkles size={20} />
        </span>
        <div>
          <strong>{courseName}</strong>
          <small>
            {aiConfigured ? '课程资料问答 · 回答带引用' : '原文检索模式 · 配置 AI 后开启生成式回答'}
          </small>
        </div>
        <span className="pill">课程内检索</span>
      </div>
      <div className="chat-messages">
        {!messages.length && (
          <div className="chat-welcome">
            <span className="big-spark">
              <Sparkles size={32} />
            </span>
            <h2>把不明白的地方，问明白。</h2>
            <p>
              答案从这门课的资料中寻找。
              <br />
              先上传课件，再用具体概念或关键词提问。
            </p>
            <div className="prompt-suggestions">
              {['解释课件中条件概率的定义', '独立与互斥有什么区别？'].map((q) => (
                <button key={q} onClick={() => setQuestion(q)}>
                  {q}
                  <ArrowUpRight size={14} />
                </button>
              ))}
            </div>
            <small>以上为示例提问，请替换成你的课程内容。</small>
          </div>
        )}
        {messages.map((m) => (
          <div className={`message ${m.role}`} key={m.id}>
            <span className="message-avatar">
              {m.role === 'user' ? '我' : <Sparkles size={17} />}
            </span>
            <div className="message-content">
              {m.role === 'assistant' && (
                <small className="message-mode">
                  {m.mode === 'excerpts'
                    ? '课件原文检索'
                    : m.mode === 'no-evidence'
                      ? '资料不足'
                      : m.mode === 'ai-hybrid'
                        ? 'AI 回答 · 混合检索'
                        : 'AI 回答 · 关键词检索'}
                </small>
              )}
              <div className="message-text">{m.content}</div>
              {m.citations?.length > 0 && (
                <div className="citations">
                  <small>检索来源 · 点击查看原文</small>
                  {m.citations.map((c) => (
                    <button key={c.id} onClick={() => onCitation(c)}>
                      <FileText size={14} />
                      <span>
                        [{c.id}] {c.documentName} · 第 {c.page} 页
                      </span>
                      <ExternalLink size={12} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="thinking">
            <Loader2 className="spin" size={17} />
            正在查找课程资料并组织回答…
          </div>
        )}
        <div ref={end} />
      </div>
      <form className="chat-input" onSubmit={send}>
        <textarea
          aria-label="课程问题"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="问一个具体的问题，或输入课件关键词…"
          maxLength={2000}
          rows={2}
          disabled={sending}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send(e);
            }
          }}
        />
        <button
          className="send-button"
          aria-label="发送问题"
          disabled={sending || !question.trim()}
        >
          {sending ? <Loader2 className="spin" size={20} /> : <Send size={20} />}
        </button>
      </form>
      <p className="chat-footnote">每次提问独立检索，请写明概念。AI 回答仍需对照来源核实。</p>
    </div>
  );
}
function CalendarView({
  assignments,
  zone,
  clock,
  dailyHours,
  onEdit,
  onToggle,
  onDelete,
}: {
  assignments: Assignment[];
  zone: string;
  clock: number;
  dailyHours: number;
  onEdit: (a: Assignment) => void;
  onToggle: (a: Assignment) => void;
  onDelete: (a: Assignment) => void;
}) {
  const [offset, setOffset] = useState(0);
  const month = DateTime.fromMillis(clock).setZone(zone).startOf('month').plus({ months: offset });
  const start = month.startOf('week');
  const days = Array.from({ length: 42 }, (_, i) => start.plus({ days: i }));
  const today = DateTime.fromMillis(clock).setZone(zone).toISODate();
  const plan = weekPlan(assignments, dailyHours, zone, new Date(clock));
  return (
    <>
      <div className="calendar-layout">
        <div className="panel calendar">
          <div className="calendar-heading">
            <h2>{month.toFormat('yyyy 年 M 月')}</h2>
            <div className="row">
              <button className="button small" onClick={() => setOffset(0)}>
                本月
              </button>
              <button
                className="icon-btn"
                aria-label="上个月"
                onClick={() => setOffset(offset - 1)}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                className="icon-btn"
                aria-label="下个月"
                onClick={() => setOffset(offset + 1)}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          <div className="week-labels">
            {['一', '二', '三', '四', '五', '六', '日'].map((x) => (
              <span key={x}>周{x}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {days.map((d) => (
              <div
                key={d.toISODate()}
                className={`calendar-day ${d.month !== month.month ? 'outside' : ''} ${d.toISODate() === today ? 'today' : ''}`}
              >
                <span className="day-num">{d.day}</span>
                {assignments
                  .filter(
                    (a) => DateTime.fromISO(a.due_at).setZone(zone).toISODate() === d.toISODate(),
                  )
                  .map((a) => (
                    <button
                      className={`calendar-event ${a.completed ? 'completed' : ''}`}
                      key={a.id}
                      style={{ '--course-color': a.color } as React.CSSProperties}
                      onClick={() => onEdit(a)}
                      title={a.title}
                    >
                      {a.title}
                    </button>
                  ))}
              </div>
            ))}
          </div>
        </div>
        <div className="panel deadline-list">
          <SectionTitle
            title="作业清单"
            subtitle={`${assignments.filter((a) => !a.completed).length} 项尚未完成`}
          />
          {assignments.map((a) => (
            <article key={a.id} className={a.completed ? 'completed' : ''}>
              <button
                className="check-task"
                aria-label={a.completed ? `恢复 ${a.title}` : `完成 ${a.title}`}
                onClick={() => onToggle(a)}
              >
                {a.completed ? <CheckCircle2 size={21} /> : <Circle size={21} />}
              </button>
              <div>
                <small style={{ color: a.color }}>{a.course_name}</small>
                <button className="task-title" onClick={() => onEdit(a)}>
                  {a.title}
                </button>
                <p>
                  {dateLabel(a.due_at, zone, 'M/d HH:mm')} · {a.hours}h
                </p>
                <span
                  className={`pill ${!a.completed && Date.parse(a.due_at) - clock < 86400000 ? 'danger' : ''}`}
                >
                  {a.completed ? '已完成' : dueLabel(a.due_at, clock)}
                </span>
              </div>
              <button
                className="icon-btn"
                aria-label={`删除作业 ${a.title}`}
                onClick={() => onDelete(a)}
              >
                <Trash2 size={14} />
              </button>
            </article>
          ))}
          {!assignments.length && <p className="muted">还没有作业，添加一个截止日期吧。</p>}
        </div>
      </div>
      <SectionTitle
        title="未来 7 天 · 工作量协调"
        subtitle="按截止日期优先分配每日学习时长；这是估算建议，尚未校验课表和具体空闲时段。"
      />
      <div className={`plan-summary ${plan.unscheduled ? 'overloaded' : ''}`}>
        <Clock3 size={19} />
        <span>
          预计任务 <strong>{plan.demand.toFixed(1)}h</strong> / 可用{' '}
          <strong>{plan.capacity.toFixed(1)}h</strong>
        </span>
        {plan.unscheduled > 0 ? (
          <b>有 {plan.unscheduled.toFixed(1)} 小时无法在截止前排入，需调整计划。</b>
        ) : (
          <span>当前任务可按每日预算安排。</span>
        )}
      </div>
      <div className="plan-grid">
        {plan.days.map((d) => (
          <div className="plan-day" key={d.date}>
            <div>
              <strong>{DateTime.fromISO(d.date).setLocale('zh-CN').toFormat('ccc')}</strong>
              <span>{DateTime.fromISO(d.date).toFormat('M/d')}</span>
            </div>
            {d.tasks.map((t, i) => (
              <article key={i}>
                <strong>{t.title}</strong>
                <small>
                  {t.course} · {t.hours.toFixed(1)}h
                </small>
              </article>
            ))}
            {!d.tasks.length && <p>留白 / 自主复习</p>}
            <small>
              {d.hours.toFixed(1)} / {dailyHours}h
            </small>
          </div>
        ))}
      </div>
    </>
  );
}
function PracticeView({
  topics,
  act,
  onEdit,
  onDelete,
  onError,
  onCitation,
}: {
  topics: Topic[];
  act: (fn: () => Promise<unknown>, msg?: string) => Promise<boolean>;
  onEdit: (t: Topic) => void;
  onDelete: (t: Topic) => void;
  onError: (s: string) => void;
  onCitation: (t: Topic) => void;
}) {
  const [selected, setSelected] = useState(''),
    [questions, setQuestions] = useState<Question[]>([]),
    [review, setReview] = useState<Question[] | null>(null),
    [manual, setManual] = useState(false),
    [index, setIndex] = useState(0),
    [choice, setChoice] = useState(''),
    [hinted, setHinted] = useState(false),
    [feedback, setFeedback] = useState<{ score: number; feedback: string; answer: string } | null>(
      null,
    ),
    [sending, setSending] = useState(false);
  const topic = topics.find((t) => t.id === selected) || topics[0];
  const topicId = topic?.id;
  const load = useCallback(async () => {
    if (topicId) {
      setQuestions(await api<Question[]>(`topics/${topicId}/questions`));
      setIndex(0);
      setChoice('');
      setFeedback(null);
      setHinted(false);
    } else setQuestions([]);
  }, [topicId]);
  useEffect(() => {
    void load().catch((e) => onError(e.message));
  }, [load, onError]);
  const q = questions[index];
  const submit = async () => {
    if (!q || !choice) return;
    setSending(true);
    try {
      setFeedback(await api(`questions/${q.id}/answer`, { answer: choice, hinted }));
      await act(async () => {}, '作答已记录。');
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSending(false);
    }
  };
  if (!topics.length)
    return (
      <Empty
        icon={BrainCircuit}
        title="先把知识点整理出来"
        body="在课件页点击星光按钮提取候选，或手动添加知识点。每个知识点可准备五档练习。"
      />
    );
  return (
    <>
      <div className="practice-layout">
        <div className="topic-list">
          <div className="topic-list-header">
            <strong>知识点地图</strong>
            <span>{topics.length} 项</span>
          </div>
          {topics.map((t) => (
            <button
              className={`topic-card ${topicId === t.id ? 'selected' : ''}`}
              key={t.id}
              onClick={() => setSelected(t.id)}
            >
              <div>
                <span className={`status-dot ${t.mastery?.status}`} />
                <strong>{t.title}</strong>
              </div>
              <p>{t.course_name}</p>
              <div className="topic-card-bottom">
                <span>{t.status === 'draft' ? '待确认' : t.mastery?.label}</span>
                <span>{t.approved_count || 0}/5 题起</span>
              </div>
              {t.mastery?.score !== null && (
                <div className={`mastery-bar ${t.mastery?.status}`}>
                  <i style={{ width: `${t.mastery?.score || 0}%` }} />
                </div>
              )}
            </button>
          ))}
        </div>
        <div className="practice-main">
          <div className="panel topic-detail">
            <div className="topic-detail-heading">
              <div>
                <span className="eyebrow">KNOWLEDGE CHECK</span>
                <h2>{topic.title}</h2>
              </div>
              <span className={`mastery-score ${topic.mastery?.status}`}>
                {topic.mastery?.score ?? '—'}
                <small>{topic.mastery?.score !== null ? '/ 100' : '待评估'}</small>
              </span>
            </div>
            <p>{topic.description}</p>
            <div className="row wrap">
              <span
                className={`pill ${topic.mastery?.status === 'review' ? 'danger' : topic.mastery?.status === 'secure' ? 'success' : ''}`}
              >
                {topic.mastery?.label}
              </span>
              <span className="muted">{topic.mastery?.count || 0} 道独立有效题</span>
              <button className="text-button" onClick={() => onCitation(topic)}>
                <FileText size={14} />
                来源第 {topic.source_page} 页
              </button>
            </div>
            <div className="topic-tools">
              <button className="button small" onClick={() => onEdit(topic)}>
                <Pencil size={14} />
                {topic.status === 'draft' ? '确认知识点' : '编辑'}
              </button>
              <button
                className="button small"
                disabled={topic.status !== 'confirmed'}
                onClick={() =>
                  act(
                    () => api(`topics/${topic.id}/generate`, {}),
                    '正在生成五档候选题，完成后请审核。',
                  )
                }
              >
                <Sparkles size={14} />
                生成五档题
              </button>
              <button
                className="button small"
                onClick={async () => {
                  try {
                    setReview(await api<Question[]>(`topics/${topic.id}/questions?review=1`));
                  } catch (e) {
                    onError((e as Error).message);
                  }
                }}
              >
                审核题库 ({topic.question_count || 0})
              </button>
              <button className="button small" onClick={() => setManual(true)}>
                <Plus size={14} />
                手动出题
              </button>
              <button className="icon-btn" aria-label="删除知识点" onClick={() => onDelete(topic)}>
                <Trash2 size={16} />
              </button>
            </div>
          </div>
          <div className="panel question-panel">
            {q ? (
              <>
                <div className="question-meta">
                  <span className="pill">
                    难度 {q.difficulty} / 5 ·{' '}
                    {['', '识记', '理解', '直接应用', '多步辨错', '迁移综合'][q.difficulty]}
                  </span>
                  <span>
                    {index + 1} / {questions.length}
                  </span>
                </div>
                <h3>{q.prompt}</h3>
                <div className="answer-options">
                  {q.options.map((o, i) => {
                    const letter = 'ABCD'[i];
                    return (
                      <button
                        key={letter}
                        disabled={Boolean(feedback)}
                        className={`${choice === letter ? 'chosen' : ''} ${feedback?.answer === letter ? 'correct' : ''} ${feedback && choice === letter && feedback.answer !== letter ? 'incorrect' : ''}`}
                        onClick={() => setChoice(letter)}
                      >
                        <span>{letter}</span>
                        {o}
                        {feedback?.answer === letter && <Check size={18} />}
                      </button>
                    );
                  })}
                </div>
                <label className="hint-check">
                  <input
                    type="checkbox"
                    checked={hinted}
                    disabled={Boolean(feedback)}
                    onChange={(e) => setHinted(e.target.checked)}
                  />
                  这题用过提示或看过答案（仅计练习，不计独立掌握证据）
                </label>
                {feedback && (
                  <div className={`feedback ${feedback.score ? 'right' : 'wrong'}`}>
                    <strong>{feedback.score ? '这次答对了' : '这个知识点值得再看一遍'}</strong>
                    <p>{feedback.feedback}</p>
                    <button className="text-button" onClick={() => onCitation(topic)}>
                      回到课件复习 <ArrowUpRight size={14} />
                    </button>
                  </div>
                )}
                <div className="question-footer">
                  <button
                    className="button"
                    disabled={index === 0}
                    onClick={() => {
                      setIndex(index - 1);
                      setChoice('');
                      setFeedback(null);
                      setHinted(false);
                    }}
                  >
                    <ChevronLeft size={16} />
                    上一题
                  </button>
                  {!feedback ? (
                    <button
                      className="button primary"
                      disabled={!choice || sending}
                      onClick={submit}
                    >
                      {sending ? <Loader2 size={16} className="spin" /> : <Check size={16} />}
                      提交答案
                    </button>
                  ) : (
                    <button
                      className="button primary"
                      onClick={() => {
                        setIndex((index + 1) % questions.length);
                        setChoice('');
                        setFeedback(null);
                        setHinted(false);
                      }}
                    >
                      {index === questions.length - 1 ? '回到第一题' : '下一题'}
                      <ArrowRight size={16} />
                    </button>
                  )}
                </div>
              </>
            ) : (
              <Empty
                icon={Target}
                title="题库还在准备中"
                body="先确认知识点，再生成并审核五档题；也可以手动录入题目。"
              />
            )}
          </div>
          <p className="footnote">
            同一道题只采用第一次独立作答作为证据；复习后用新题复测。至少五题且覆盖应用层才会给出初步评级。
          </p>
        </div>
      </div>
      {review && (
        <Modal
          wide
          title="审核候选题"
          subtitle="核对题干、选项、答案和课件依据后再批准。生成结果尚未自动证明正确。"
          onClose={() => setReview(null)}
        >
          <div className="review-list">
            {review.map((q) => (
              <article key={q.id}>
                <div className="row">
                  <span className="pill">难度 {q.difficulty}</span>
                  <span className={`pill ${q.status === 'approved' ? 'success' : ''}`}>
                    {q.status === 'approved' ? '已批准' : '待审核'}
                  </span>
                </div>
                <h3>{q.prompt}</h3>
                {q.options.map((o, i) => (
                  <p key={i}>
                    {'ABCD'[i]}. {o}
                  </p>
                ))}
                <div className="review-answer">
                  正确答案：{q.answer}
                  <p>{q.explanation}</p>
                </div>
                <div className="row">
                  {q.status !== 'approved' && (
                    <button
                      className="button primary small"
                      onClick={async () => {
                        if (
                          await act(() => api(`questions/${q.id}`, {}, 'PATCH'), '题目已批准。')
                        ) {
                          setReview(
                            review.map((x) => (x.id === q.id ? { ...x, status: 'approved' } : x)),
                          );
                          await load();
                        }
                      }}
                    >
                      <Check size={14} />
                      核对无误，批准
                    </button>
                  )}
                  <button
                    className="button small"
                    onClick={async () => {
                      if (
                        await act(
                          () => api(`questions/${q.id}`, undefined, 'DELETE'),
                          '题目已移除。',
                        )
                      ) {
                        setReview(review.filter((x) => x.id !== q.id));
                        await load();
                      }
                    }}
                  >
                    <Trash2 size={14} />
                    移除题目
                  </button>
                </div>
              </article>
            ))}
            {!review.length && (
              <Empty title="暂无题目" body="生成五档候选题，或手动添加自己的题目。" />
            )}
          </div>
        </Modal>
      )}
      {manual && (
        <Modal title="添加一道单选题" onClose={() => setManual(false)}>
          <QuestionForm
            topicId={topic.id}
            onSave={async (value) => {
              if (await act(() => api('questions', value), '题目已加入题库。')) {
                setManual(false);
                await load();
              }
            }}
          />
        </Modal>
      )}
    </>
  );
}
function QuestionForm({
  topicId,
  onSave,
}: {
  topicId: string;
  onSave: (v: unknown) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const f = new FormData(e.currentTarget);
        try {
          await onSave({
            topic_id: topicId,
            difficulty: Number(f.get('difficulty')),
            prompt: f.get('prompt'),
            options: ['A', 'B', 'C', 'D'].map((k) => f.get(k)),
            answer: f.get('answer'),
            explanation: f.get('explanation'),
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        题干
        <textarea name="prompt" required rows={2} />
      </label>
      <div className="form-grid">
        {['A', 'B', 'C', 'D'].map((k) => (
          <label key={k}>
            选项 {k}
            <input name={k} required />
          </label>
        ))}
      </div>
      <div className="form-grid">
        <label>
          正确选项
          <select name="answer">
            {['A', 'B', 'C', 'D'].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <label>
          难度
          <select name="difficulty">
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        答案解析
        <textarea name="explanation" required rows={3} />
      </label>
      <div className="form-actions">
        <Submit busy={busy} />
      </div>
    </form>
  );
}
function SettingsView({
  state,
  busy,
  act,
}: {
  state: Snapshot;
  busy: boolean;
  act: (fn: () => Promise<unknown>, msg?: string) => Promise<boolean>;
}) {
  return (
    <div className="settings-grid">
      <section className="panel settings-card">
        <SectionTitle title="学习偏好" subtitle="日期和工作量会按这里的设置显示。" />
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void act(() =>
              api(
                'settings',
                { timezone: f.get('timezone'), dailyHours: Number(f.get('dailyHours')) },
                'PATCH',
              ),
            );
          }}
        >
          <label>
            显示时区
            <input name="timezone" defaultValue={state.settings.timezone} required />
          </label>
          <label>
            每天可学习的小时数
            <input
              name="dailyHours"
              type="number"
              min="0.5"
              max="16"
              step="0.5"
              defaultValue={state.settings.dailyHours}
              required
            />
          </label>
          <p className="help">日程协调目前按每天总小时数估算，不代表精确时段排课。</p>
          <Submit busy={busy} />
        </form>
      </section>
      <section className="panel settings-card">
        <SectionTitle title="模型连接" subtitle="密钥只配置在服务端 .env.local 中。" />
        <div className="connection-state">
          <span className={`live-dot ${state.settings.aiConfigured ? '' : 'offline'}`} />
          {state.settings.aiConfigured
            ? `已连接配置 · ${state.settings.model}`
            : '尚未配置 AI 模型'}
        </div>
        <p>
          无需密钥即可管理资料和作业、进行关键词原文检索、使用手动题库。配置后可生成回答、知识点和候选题。
        </p>
        <pre>
          AI_BASE_URL=https://api.openai.com/v1{'\n'}AI_API_KEY=你的密钥{'\n'}AI_MODEL=你的模型名称
          {'\n'}EMBEDDING_MODEL=可选的向量模型{'\n'}AI_DAILY_LIMIT=100
        </pre>
        <p className="help">
          修改后重启应用。更改向量模型后，在课件页重新解析。使用 AI
          时，相关课件内容会发送给配置的服务商。
        </p>
        <div className="usage-line">
          <span>今日 AI 调用（UTC）</span>
          <strong>
            {state.settings.aiUsed} / {state.settings.aiDailyLimit}
          </strong>
        </div>
      </section>
      <section className="panel settings-card">
        <SectionTitle title="文件与提醒" />
        <div className="connection-state">
          <span className={`live-dot ${state.settings.emailConfigured ? '' : 'offline'}`} />
          {state.settings.emailConfigured ? '邮件配置已填写' : '目前仅站内提醒'}
        </div>
        <p>
          邮件需要填写 SMTP_HOST、SMTP_FROM、REMINDER_EMAIL
          等配置。即使关闭网页，后台运行时也会检查提醒；电脑休眠或关机时暂停。
        </p>
        <p>
          Office 原排版预览需要安装 LibreOffice，并设置 SOFFICE_PATH。扫描 PDF 与图片目前不做 OCR。
        </p>
      </section>
      <section className="panel settings-card">
        <SectionTitle title="本地数据" />
        <p>
          课程、题目、作答和聊天记录保存在 <code>data/study.sqlite</code>，课件保存在{' '}
          <code>data/uploads</code>。备份时先停止应用，再复制整个 <code>data</code> 目录。
        </p>
        <p>
          这是没有登录的单用户本地版，仅监听本机。GitHub
          公开的是源代码，上传课件、数据库和密钥不会提交。
        </p>
        <button
          className="button"
          disabled={busy}
          onClick={() => act(() => api('demo', {}), '示例课程已载入。')}
        >
          <Sparkles size={16} />
          载入示例课程
        </button>
      </section>
    </div>
  );
}
