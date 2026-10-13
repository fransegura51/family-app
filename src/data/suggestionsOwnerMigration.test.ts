// Sugerencias: la dueña de la app es una PERSONA (profiles.is_app_owner), no una familia escrita a mano (migración 0254). Se lee el texto.
import { describe, expect, it } from 'vitest'
import sql from '../../supabase/migrations/0254_suggestions_owner_by_profile.sql?raw'
import screen from '@/ui/SuggestionsScreen.tsx?raw'
import data from '@/data/suggestions.ts?raw'

describe('0254: sugerencias — la dueña es una persona', () => {
  it('ya no queda ninguna familia escrita a mano en las reglas', () => {
    expect(sql).not.toContain('011429a4')
    expect(screen).not.toContain('011429a4')
  })

  it('am_i_app_owner solo la puede llamar quien ha iniciado sesión', () => {
    expect(sql).toContain('revoke execute on function public.am_i_app_owner() from public, anon;')
    expect(sql).toContain('grant execute on function public.am_i_app_owner() to authenticated;')
    expect(sql).toContain('set search_path = \'\'')
    expect(sql).toContain('select p.is_app_owner from public.profiles p where p.id = auth.uid()')
  })

  it('ver y borrar: las de tu familia o, si eres la dueña, todas; cambiar el estado: solo la dueña', () => {
    expect((sql.match(/family_id = \(select private\.current_family_id\(\)\) or \(select public\.am_i_app_owner\(\)\)/g) ?? []).length).toBe(2)
    expect(sql).toContain('for update\n  using ((select public.am_i_app_owner()))\n  with check ((select public.am_i_app_owner()))'.replace(/\n/g, sql.includes('\r\n') ? '\r\n' : '\n'))
  })

  it('el nombre de la familia que dejó la sugerencia solo se da a la dueña', () => {
    expect(sql).toMatch(/and public\.am_i_app_owner\(\)/)
  })

  it('la pantalla pregunta a la base si eres la dueña, en vez de comparar con una familia', () => {
    expect(screen).toContain('amIAppOwner()')
    expect(data).toContain("supabase.rpc('am_i_app_owner')")
  })
})
