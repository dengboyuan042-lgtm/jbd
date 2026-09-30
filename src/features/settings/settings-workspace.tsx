'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import {
  Bell,
  Brain,
  Database,
  Keyboard,
  Languages,
  Mic,
  Palette,
  Plug,
  Shield,
  Sparkles,
  User,
} from 'lucide-react';
import { toast } from 'sonner';

import { Page, PageBody, PageHeader } from '@/components/shell/page';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Badge, Kbd, Skeleton, Switch } from '@/components/ui/primitives';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/menu';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { cn, formatBytes } from '@/lib/utils';
import { useWorkspace } from '@/features/workspace/workspace-context';
import { MemoryPanel, type MemoryRow } from '@/features/memory/memory-panel';
import { usePanel } from '@/features/workspace/workspace-context';

type SystemInfo = {
  capabilities: {
    aiDriver: string;
    aiLive: boolean;
    embeddingDriver: string;
    speechDriver: string;
    speechLive: boolean;
    storageDriver: string;
    databaseDriver: string;
  };
  ai: {
    provider: string;
    label: string;
    hosted: boolean;
    models: { id: string; label: string; contextWindow: number }[];
    embedding: { provider: string; model: string; dimensions: number };
  };
  speech: { provider: string; label: string; hosted: boolean; supportsStreaming: boolean };
  upload: { extensions: string[]; maxBytes: number };
};

const SECTIONS = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'language', label: 'Language', icon: Languages },
  { id: 'models', label: 'AI models', icon: Sparkles },
  { id: 'voice', label: 'Voice & transcription', icon: Mic },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
  { id: 'storage', label: 'Storage & data', icon: Database },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'privacy', label: 'Privacy', icon: Shield },
] as const;

export function SettingsWorkspace() {
  const { user } = useWorkspace();
  const { theme, setTheme } = useTheme();
  const [section, setSection] = React.useState<string>('account');
  const [name, setName] = React.useState(user.name);
  const [saving, setSaving] = React.useState(false);

  const system = useApi<SystemInfo>('/api/system/info');
  const memories = useApi<{ memories: MemoryRow[] }>('/api/memories?scope=user');

  usePanel({ mode: 'hidden' }, []);

  const saveProfile = async () => {
    setSaving(true);
    try {
      await api.patch('/api/settings', { name });
      toast.success('Saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const capabilities = system.data?.capabilities;

  return (
    <Page>
      <PageHeader title="Settings" />
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-52 shrink-0 overflow-y-auto border-r border-border bg-bg-subtle p-2 scrollbar-thin md:block">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={cn(
                'flex h-7 w-full items-center gap-2.5 rounded-md px-2 text-sm transition-colors',
                section === item.id
                  ? 'bg-surface-active font-medium text-fg'
                  : 'text-secondary hover:bg-surface-hover hover:text-fg',
              )}
            >
              <item.icon className="size-3.5 shrink-0 text-tertiary" />
              {item.label}
            </button>
          ))}
        </aside>

        <PageBody width="narrow">
          {section === 'account' ? (
            <Panel title="Account" description="Your profile and sign-in details.">
              <Field label="Name">
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Email">
                <Input value={user.email} readOnly className="opacity-70" />
              </Field>
              <Button variant="primary" size="sm" onClick={saveProfile} loading={saving}>
                Save changes
              </Button>
            </Panel>
          ) : null}

          {section === 'appearance' ? (
            <Panel title="Appearance" description="How the workspace looks on this device.">
              <div className="grid grid-cols-3 gap-2">
                {(['light', 'dark', 'system'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setTheme(option)}
                    className={cn(
                      'rounded-lg border p-3 text-left transition-colors',
                      theme === option
                        ? 'border-accent bg-accent-subtle'
                        : 'border-border bg-surface hover:border-border-strong',
                    )}
                  >
                    <div
                      className={cn(
                        'mb-2 h-10 rounded-md border border-border',
                        option === 'light'
                          ? 'bg-white'
                          : option === 'dark'
                            ? 'bg-neutral-900'
                            : 'bg-gradient-to-r from-white to-neutral-900',
                      )}
                    />
                    <span className="text-xs font-medium capitalize text-fg">{option}</span>
                  </button>
                ))}
              </div>
            </Panel>
          ) : null}

          {section === 'language' ? (
            <Panel title="Language" description="Interface and default transcription language.">
              <Field label="Interface language">
                <Select defaultValue={user.locale}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <p className="text-xs text-tertiary">
                Additional interface languages are not bundled in this build. Transcription
                language is chosen per recording.
              </p>
            </Panel>
          ) : null}

          {section === 'models' ? (
            <Panel
              title="AI models"
              description="Providers are configured with environment variables so keys never reach the browser."
            >
              {system.loading ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <>
                  <Row label="Provider">
                    <span className="flex items-center gap-2">
                      {system.data?.ai.label}
                      <Badge tone={system.data?.ai.hosted ? 'success' : 'neutral'}>
                        {system.data?.ai.hosted ? 'hosted' : 'built-in'}
                      </Badge>
                    </span>
                  </Row>
                  <Row label="Model">{system.data?.ai.models[0]?.id ?? '—'}</Row>
                  <Row label="Embeddings">
                    {system.data?.ai.embedding.model} · {system.data?.ai.embedding.dimensions}d
                  </Row>
                  {!system.data?.ai.hosted ? (
                    <Note>
                      The built-in engine derives every answer from your own material using
                      extractive analysis. Set <Code>AI_DRIVER</Code> and the matching API key to
                      switch to a hosted model — nothing else in the app changes.
                    </Note>
                  ) : null}
                </>
              )}
            </Panel>
          ) : null}

          {section === 'voice' ? (
            <Panel
              title="Voice & transcription"
              description="Live capture runs on-device; server-side transcription needs a provider."
            >
              {system.loading ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <>
                  <Row label="Live recognition">
                    {typeof window !== 'undefined' &&
                    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
                      ? 'Available in this browser'
                      : 'Not supported in this browser'}
                  </Row>
                  <Row label="Server provider">
                    <span className="flex items-center gap-2">
                      {system.data?.speech.label}
                      <Badge tone={system.data?.speech.hosted ? 'success' : 'neutral'}>
                        {system.data?.speech.hosted ? 'configured' : 'not configured'}
                      </Badge>
                    </span>
                  </Row>
                  {!system.data?.speech.hosted ? (
                    <Note>
                      Set <Code>SPEECH_DRIVER</Code> to <Code>openai-whisper</Code> or{' '}
                      <Code>deepgram</Code> with its key to transcribe uploaded audio and video
                      files on the server.
                    </Note>
                  ) : null}
                </>
              )}
            </Panel>
          ) : null}

          {section === 'memory' ? (
            <Panel
              title="Memory"
              description="Everything the assistant remembers about you. Fully editable."
            >
              {memories.loading ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <MemoryPanel
                  scope="user"
                  memories={memories.data?.memories ?? []}
                  onChange={memories.refresh}
                />
              )}
            </Panel>
          ) : null}

          {section === 'notifications' ? (
            <Panel title="Notifications" description="What shows up in the activity menu.">
              <Toggle label="Processing finished" description="Uploads, transcripts and tool runs." defaultChecked />
              <Toggle label="Study reminders" description="When cards are due for review." defaultChecked />
              <Toggle label="Weekly digest" description="A summary of what you added and produced." />
            </Panel>
          ) : null}

          {section === 'shortcuts' ? (
            <Panel title="Keyboard shortcuts" description="">
              <div className="divide-y divide-border rounded-lg border border-border bg-surface">
                {[
                  { keys: 'mod K', label: 'Open the command palette' },
                  { keys: 'mod .', label: 'Toggle the context panel' },
                  { keys: 'mod \\', label: 'Collapse the sidebar' },
                  { keys: 'Space', label: 'Reveal a flashcard answer' },
                  { keys: '1 – 4', label: 'Grade a flashcard' },
                  { keys: 'Enter', label: 'Send a message' },
                  { keys: 'Shift Enter', label: 'New line in a message' },
                ].map((row) => (
                  <div key={row.keys} className="flex items-center gap-3 px-3 py-2">
                    <span className="flex-1 text-sm text-secondary">{row.label}</span>
                    <Kbd>{row.keys}</Kbd>
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}

          {section === 'storage' ? (
            <Panel title="Storage & data" description="Where your material lives.">
              {system.loading ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <>
                  <Row label="Database">{capabilities?.databaseDriver}</Row>
                  <Row label="File storage">{capabilities?.storageDriver}</Row>
                  <Row label="Max upload">{formatBytes(system.data?.upload.maxBytes ?? 0)}</Row>
                  <Row label="Supported types">
                    <span className="text-right text-xs leading-relaxed text-tertiary">
                      {system.data?.upload.extensions.join(', ')}
                    </span>
                  </Row>
                </>
              )}
            </Panel>
          ) : null}

          {section === 'integrations' ? (
            <Panel
              title="Integrations"
              description="Third-party services are opt-in and configured server-side."
            >
              {system.loading ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <div className="space-y-1.5">
                  <Integration
                    name="Language model"
                    detail={system.data?.ai.label ?? ''}
                    connected={Boolean(system.data?.ai.hosted)}
                    env="AI_DRIVER"
                  />
                  <Integration
                    name="Transcription"
                    detail={system.data?.speech.label ?? ''}
                    connected={Boolean(system.data?.speech.hosted)}
                    env="SPEECH_DRIVER"
                  />
                  <Integration
                    name="Object storage"
                    detail={capabilities?.storageDriver === 's3' ? 'S3-compatible' : 'Local disk'}
                    connected={capabilities?.storageDriver === 's3'}
                    env="STORAGE_DRIVER"
                  />
                  <Integration
                    name="Database"
                    detail={
                      capabilities?.databaseDriver === 'postgres'
                        ? 'Postgres server'
                        : 'Embedded Postgres (PGlite)'
                    }
                    connected={capabilities?.databaseDriver === 'postgres'}
                    env="DATABASE_DRIVER"
                  />
                </div>
              )}
            </Panel>
          ) : null}

          {section === 'privacy' ? (
            <Panel title="Privacy" description="What leaves this machine.">
              <Note>
                Every API route verifies your session and scopes queries by user id — material is
                never shared between accounts. With the built-in engine and local storage
                configured, no content leaves the server at all. When a hosted model is
                configured, only the passages needed to answer a question are sent to it.
              </Note>
              <Row label="Live speech recognition">
                Runs in your browser; audio is not uploaded until you save the recording.
              </Row>
            </Panel>
          ) : null}
        </PageBody>
      </div>
    </Page>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 animate-fade-in">
      <div>
        <h2 className="text-sm font-medium text-fg">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs leading-relaxed text-tertiary">{description}</p>
        ) : null}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-surface px-3 py-2.5">
      <span className="text-xs text-tertiary">{label}</span>
      <span className="text-right text-xs text-fg">{children}</span>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-border bg-bg-subtle px-3 py-2.5 text-xs leading-relaxed text-secondary">
      {children}
    </p>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-xs bg-bg-sunken px-1 py-0.5 font-mono text-2xs text-fg">
      {children}
    </code>
  );
}

function Toggle({
  label,
  description,
  defaultChecked,
}: {
  label: string;
  description: string;
  defaultChecked?: boolean;
}) {
  const [checked, setChecked] = React.useState(Boolean(defaultChecked));
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-surface px-3 py-2.5">
      <div>
        <p className="text-xs font-medium text-fg">{label}</p>
        <p className="mt-0.5 text-2xs text-tertiary">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={setChecked} />
    </div>
  );
}

function Integration({
  name,
  detail,
  connected,
  env,
}: {
  name: string;
  detail: string;
  connected: boolean;
  env: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-fg">{name}</p>
        <p className="mt-0.5 truncate text-2xs text-tertiary">{detail}</p>
      </div>
      <code className="hidden rounded-xs bg-bg-sunken px-1 py-0.5 font-mono text-2xs text-tertiary sm:block">
        {env}
      </code>
      <Badge tone={connected ? 'success' : 'neutral'}>
        {connected ? 'Connected' : 'Default'}
      </Badge>
    </div>
  );
}
