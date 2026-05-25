-- =============================================================================
-- Auditoría IA clasificación v2: aplicación manual de sugerencias
-- =============================================================================

alter table public.ai_clasificacion_reviews
  add column if not exists aplicado_manual boolean not null default false,
  add column if not exists tipo_aplicado text,
  add column if not exists subtipo_aplicado text;

comment on column public.ai_clasificacion_reviews.aplicado_manual is
  'true cuando el usuario confirmó y aplicó la sugerencia IA al gasto.';
comment on column public.ai_clasificacion_reviews.tipo_aplicado is
  'Categoría financiera efectivamente aplicada (post-confirmación).';
comment on column public.ai_clasificacion_reviews.subtipo_aplicado is
  'Subtipo efectivamente aplicado (post-confirmación).';

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
      'error_aplicar'
    )
  );
