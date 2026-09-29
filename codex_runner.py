"""使用學員自己登入的 Codex，只回答這次提供的產品資料。"""
import json
import os
import pathlib
import shutil
import subprocess
import tempfile

DISABLED = ('shell_tool', 'unified_exec', 'shell_snapshot', 'code_mode_host', 'code_mode',
            'apps', 'enable_mcp_apps', 'plugins', 'remote_plugin', 'hooks', 'browser_use',
            'browser_use_external', 'computer_use', 'in_app_browser', 'image_generation',
            'view_image', 'multi_agent', 'multi_agent_v2', 'goals', 'memories', 'chronicle',
            'skill_search', 'skill_mcp_dependency_install', 'workspace_dependencies',
            'sleep_tool', 'tool_suggest', 'request_permissions_tool')


# 學員多半只裝桌面版。ChatGPT 桌面版 2026-09 起把內建 Codex 搬到 codex-cli/bin/；
# 桌面版會自己更新，比另外裝、可能過期的命令列版更跟得上新模型，所以排前面。
CODEX_PATHS = ('/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex',
               '/Applications/Codex.app/Contents/Resources/codex',
               '/Applications/ChatGPT.app/Contents/Resources/codex')


def codex_binary(paths=CODEX_PATHS):
    for path in paths:
        if pathlib.Path(path).is_file() and os.access(path, os.X_OK):
            return path
    return shutil.which('codex')


def run_codex(prompt, system, schema, started=None, telemetry=None):
    trace = telemetry if telemetry is not None else {}
    binary = codex_binary()
    if not binary:
        raise ValueError('請先安裝 Codex 並用自己的 ChatGPT 帳號登入。')
    env = {k: os.environ[k] for k in ('HOME', 'USER', 'LOGNAME', 'PATH', 'LANG', 'LC_ALL', 'TMPDIR', 'SSL_CERT_FILE', 'SSL_CERT_DIR') if k in os.environ}
    env['NO_COLOR'] = '1'
    help_text = subprocess.run([binary, 'exec', '--help'], capture_output=True, text=True, env=env, timeout=10).stdout
    if not all(flag in help_text for flag in ('--ignore-user-config', '--ignore-rules', '--strict-config', '--ephemeral')):
        raise ValueError('這版 Codex 尚不支援獨立回應，請由官方更新後再試。')
    auth = subprocess.run([binary, 'login', 'status'], capture_output=True, text=True, env=env, timeout=10)
    if auth.returncode or 'Logged in using ChatGPT' not in auth.stdout + auth.stderr:
        raise ValueError('請先用自己的 ChatGPT 訂閱帳號登入 Codex；這個入口不使用 API 金鑰。')
    with tempfile.TemporaryDirectory(prefix='business-answer-') as directory:
        schema_path = pathlib.Path(directory) / 'schema.json'
        schema_path.write_text(json.dumps(schema))
        cmd = [binary, 'exec', '--ignore-user-config', '--ignore-rules', '--strict-config', '--sandbox', 'read-only',
               '--json', '--ephemeral', '--skip-git-repo-check', '--color', 'never', '--cd', directory, '--output-schema', str(schema_path)]
        config = {'approval_policy': 'never', 'mcp_servers': {}, 'web_search': 'disabled', 'project_doc_max_bytes': 0,
                  'skills.include_instructions': False, 'skills.bundled.enabled': False, 'agents.enabled': False,
                  'apps._default.enabled': False, 'model_reasoning_effort': 'medium', 'developer_instructions': system,
                  'hide_agent_reasoning': True, 'suppress_unstable_features_warning': True}
        for key, value in config.items():
            cmd += ['-c', key + '=' + json.dumps(value, ensure_ascii=False)]
        for feature in DISABLED:
            cmd += ['--disable', feature]
        cmd += ['--enable', 'skip_host_skill_discovery', '-']
        with subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, cwd=directory, env=env) as process:
            if started:
                started(process)
            try:
                stdout, _ = process.communicate(prompt, timeout=120)
            except subprocess.TimeoutExpired:
                process.kill()
                stdout, _ = process.communicate()
                trace['raw_output'] = stdout
                raise
        trace['raw_output'] = stdout
    message = None
    completed = False
    for line in stdout.splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if event.get('type') == 'turn.completed':
            completed = True
            trace['usage'] = event.get('usage')
        if event.get('type') == 'item.completed' and event.get('item', {}).get('type') == 'agent_message':
            message = event['item'].get('text')
        if event.get('type', '').startswith('item.') and event.get('item', {}).get('type') not in ('agent_message', 'reasoning', 'error'):
            raise ValueError('助手回傳了預期外的工具操作，這次內容不會採用。')
    if process.returncode or not completed or not message:
        raise ValueError('Codex 這次未完成回應，請確認登入與剩餘用量；資料仍保留。')
    try:
        return json.loads(message)
    except ValueError:
        raise ValueError('助手回覆格式不完整，這次內容未採用。') from None
