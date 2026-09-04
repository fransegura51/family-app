import { supabase } from '@/data/supabaseClient'
import { compressImageFile } from '@/domain/imageCompression'
import type { MemberDocument } from '@/domain/types'

async function currentFamilyId(): Promise<string> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const { data: profileRow, error } = await supabase
    .from('profiles')
    .select('family_id')
    .eq('id', userResult.user.id)
    .single()
  if (error) throw error
  return profileRow.family_id
}

export async function listMemberDocuments(): Promise<MemberDocument[]> {
  const { data, error } = await supabase
    .from('member_documents')
    .select('id, family_id, member_id, storage_path, title, category')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    familyId: r.family_id,
    memberId: r.member_id,
    storagePath: r.storage_path,
    title: r.title,
    category: r.category,
  }))
}

export async function uploadMemberDocument(input: {
  memberId: string | null
  file: File
  title: string
  category: string
}): Promise<void> {
  const familyId = await currentFamilyId()
  const file = await compressImageFile(input.file)
  const ext = file.name.split('.').pop() || 'pdf'
  const path = `${familyId}/${input.memberId ?? 'general'}/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage.from('documents').upload(path, file)
  if (uploadError) throw uploadError

  const { error } = await supabase.from('member_documents').insert({
    family_id: familyId,
    member_id: input.memberId,
    storage_path: path,
    title: input.title,
    category: input.category || null,
  })
  if (error) throw error
}

export async function getMemberDocumentUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(storagePath, 3600)
  if (error) throw error
  return data.signedUrl
}

export async function deleteMemberDocument(doc: MemberDocument): Promise<void> {
  await supabase.storage.from('documents').remove([doc.storagePath])
  const { error } = await supabase.from('member_documents').delete().eq('id', doc.id)
  if (error) throw error
}
