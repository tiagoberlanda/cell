import { useState } from 'react';
import { Zap, Undo2 } from 'lucide-react';

export interface ToolCallItem {
  id: string;
  run_id: string;
  tool: string;
  args: any;
  status: string;
  result?: any;
  approval_id?: string;
  approval_status?: string;
  undoable?: boolean;
  undone_at?: string | null;
}

const statusLabels: Record<string, string> = {
  done: 'Concluído',
  denied: 'Negado',
  uncertain: 'Resultado incerto',
  waiting_child: 'Delegado',
  executing: 'Executando',
  waiting_approval: 'Aguardando aprovação',
  waiting: 'Aguardando'
};

// MCP tools are namespaced by connection id (mcp_<32 hex>_name); the id means nothing to the reader.
const computerTools: Record<string, string> = {
  pc_request_access: 'Acesso a pasta do computador',
  pc_list: 'Listar pasta do computador',
  pc_read: 'Ler arquivo do computador',
  pc_move: 'Mover no computador',
  pc_rename: 'Renomear no computador',
  pc_mkdir: 'Criar pasta no computador',
  pc_write: 'Gravar arquivo no computador',
  pc_delete: 'Excluir no computador',
  pc_run: 'Comando no computador',
  pc_status: 'Estado do computador',
  pc_job: 'Tarefas em segundo plano',
  pc_edit: 'Editar arquivo no computador',
  pc_wake: 'Ligar computador',
  pc_recipe: 'Receita de comando',
  pc_recipe_trusted: 'Receita de comando (liberada)',
  pc_save_file: 'Salvar arquivo no computador',
  pc_import: 'Trazer arquivo do computador',
  use_app: 'Abrir aplicativo'
};
const toolLabel = (tool: string) => computerTools[tool] || tool.replace(/^mcp_[0-9a-f]{32}_/, '');
const approvalLabel = (status?: string) => status === 'approved' ? 'Aprovado' : status === 'denied' ? 'Negado' : status === 'cancelled' ? 'Cancelado' : status === 'pending' ? 'Aguardando aprovação' : '';

// Plain-language summary of a computer-folder action awaiting approval; null for other tools (shown as raw arguments).
// Diff preview of a change (pc_edit): "-" removed, "+" added, "@@" position; a leading "!" means it could not be built.
export function DiffPreview({ text }: { text?: string | null }) {
  if (!text) return null;
  if (text.startsWith('!')) return <p className="diff-error">Não foi possível gerar a prévia: {text.slice(1)}</p>;
  return <pre className="diff-preview" aria-label="Prévia da alteração">{text.split('\n').map((l, i) => <span key={i} className={l.startsWith('@@') ? 'hunk' : l[0] === '+' ? 'add' : l[0] === '-' ? 'del' : 'ctx'}>{l.startsWith('@@') ? l.replace('@@ linha', 'a partir da linha') : `${l[0] === ' ' ? ' ' : l[0] === '+' ? '+' : '−'} ${l.slice(1)}`}{'\n'}</span>)}</pre>;
}

export function describeApproval(tool: string, args: any): { title: string; lines: string[] } | null {
  const a = args || {};
  if (tool === 'pc_request_access') return { title: 'Permitir acesso a esta pasta do computador?', lines: [a.path, a.reason ? `Motivo: ${a.reason}` : '', 'O agente poderá listar e ler arquivos dela e das subpastas. Mover, renomear e criar pastas continuam pedindo sua aprovação.'].filter(Boolean) };
  if (tool === 'pc_move') { const moves: any[] = Array.isArray(a.moves) ? a.moves : []; return { title: moves.length === 1 ? 'Mover 1 item no computador?' : `Mover ${moves.length} itens no computador?`, lines: moves.slice(0, 50).map(m => `${m.from} → ${m.to}`).concat(moves.length > 50 ? [`… e mais ${moves.length - 50}`] : []) }; }
  if (tool === 'pc_rename') return { title: 'Renomear no computador?', lines: [`${a.path} → ${a.newName}`] };
  if (tool === 'pc_mkdir') return { title: 'Criar pasta no computador?', lines: [a.path] };
  if (tool === 'pc_edit') return { title: 'Editar este arquivo no computador?', lines: [a.path, 'Veja abaixo as linhas removidas (−) e adicionadas (+). Dá para desfazer.'] };
  if (tool === 'pc_recipe') return { title: `Rodar a receita “${a.name}”?`, lines: ['Comando salvo por você.'] };
  if (tool === 'pc_run') return { title: a.background ? (a.computer ? `Rodar em segundo plano em ${a.computer}?` : 'Rodar em segundo plano no computador?') : a.computer ? `Rodar este comando em ${a.computer}?` : 'Rodar este comando no computador?', lines: [a.reason || 'Comando', ...(a.background ? ['Sem limite de tempo; você é avisado quando terminar.'] : []), ...String(a.command || '').split('\n').slice(0, 40).map((l: string) => `› ${l}`), a.cwd ? `Pasta: ${a.cwd}` : '', `Limite: ${a.timeoutSeconds || 60} s`].filter(Boolean) };
  if (tool === 'pc_save_file') return { title: a.overwrite ? 'Substituir este arquivo no computador?' : 'Salvar este arquivo no computador?', lines: [a.path, a.overwrite ? 'O arquivo atual é guardado e pode ser restaurado com Desfazer.' : 'Arquivo da biblioteca do Cell.'] };
  if (tool === 'pc_delete') { const paths: string[] = Array.isArray(a.paths) ? a.paths : []; return { title: paths.length === 1 ? 'Excluir 1 item do computador?' : `Excluir ${paths.length} itens do computador?`, lines: ['Vai para a Lixeira; dá para desfazer.', ...paths.slice(0, 50), ...(paths.length > 50 ? [`… e mais ${paths.length - 50}`] : [])] }; }
  if (tool === 'pc_write') return { title: a.overwrite ? 'Substituir este arquivo no computador?' : 'Criar este arquivo no computador?', lines: [a.path, `${String(a.content || '').length} caracteres${a.overwrite ? ' · substitui o arquivo existente' : ''}`] };
  return null;
}

export function ToolActivityCard({
  calls,
  defaultOpen = false,
  title = 'Ferramentas utilizadas',
  onUndo
}: {
  calls: ToolCallItem[];
  defaultOpen?: boolean;
  title?: string;
  onUndo?: (callId: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!calls || calls.length === 0) return null;

  return (
    <details className="activity-card" open={defaultOpen ? true : undefined}>
      <summary>
        <Zap size={14} className="activity-icon" />
        <span className="activity-title">{title}</span>
        <span className="activity-badge">{calls.length}</span>
      </summary>
      <div className="activity-content">
        {calls.map((c) => (
          <div className="tool-item" key={c.id}>
            <div className="tool-header">
              <strong className="tool-name" title={c.tool}>{toolLabel(c.tool)}</strong>
              {c.undoable && c.status === 'done' && onUndo && (c.undone_at
                ? <small className="tool-status undone">Desfeito</small>
                : <button type="button" className="undo-button" disabled={busy === c.id} onClick={async () => { setBusy(c.id); try { await onUndo(c.id); } finally { setBusy(null); } }}><Undo2 size={12} />{busy === c.id ? 'Desfazendo…' : 'Desfazer'}</button>)}
              <small className={`tool-status ${c.status || ''}`}>
                {statusLabels[c.status] || c.status}
              </small>
              {c.approval_status && <small className={`tool-status approval-${c.approval_status}`}>Permissão: {approvalLabel(c.approval_status)}</small>}
            </div>
            {c.args && (
              <pre className="tool-args">
                {typeof c.args === 'string' ? c.args : JSON.stringify(c.args, null, 2)}
              </pre>
            )}
            {c.result && (
              <details className="tool-result-details">
                <summary>Ver resultado</summary>
                <pre className="tool-result">
                  {typeof c.result === 'string' ? c.result : JSON.stringify(c.result, null, 2)}
                </pre>
              </details>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}
