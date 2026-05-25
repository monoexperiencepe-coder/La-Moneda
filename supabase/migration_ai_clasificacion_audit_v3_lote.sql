-- =============================================================================
-- Auditoría IA clasificación v3: aplicación masiva supervisada (batch_id)
-- =============================================================================

alter table public.ai_clasificacion_reviews
  add column if not exists batch_id uuid;

comment on column public.ai_clasificacion_reviews.batch_id is
  'UUID común para vincular filas de una misma ejecución de lote supervisado.';

create index if not exists ai_clasificacion_reviews_batch_idx
  on public.ai_clasificacion_reviews (batch_id, created_at desc)
  where batch_id is not null;

alter table public.ai_clasificacion_reviews
  drop constraint if exists ai_clasificacion_reviews_action_check;

alter table public.ai_clasificacion_reviews
  add constraint ai_clasificacion_reviews_action_check check (
    action in (
      'batch_analyze',
      'marcar_revisado',
      'ocultar',
      'reanalizar',
      'aplicar_sugerencia',
      'error_aplicar',
      'aplicar_sugerencia_lote',
      'error_aplicar_lote',
      'lote_completado'
    )
  );
