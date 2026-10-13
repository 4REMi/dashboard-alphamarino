-- Seguridad: el rol de un perfil nuevo ya NO se toma de raw_user_meta_data.
-- Esos metadatos los controla quien se registra (supabase.auth.signUp con la
-- anon key pública acepta `data`), así que alguien podía darse de alta como
-- admin. Todo usuario nuevo nace 'employee'; la invitación del dashboard
-- (inviteEmployee) fija el rol real después con el service role.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    'employee'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Seguridad: la política profiles_update_own deja a cada quien editar su
-- propia fila completa, incluido role/permissions (con la anon key, fuera del
-- dashboard). Este trigger impide que un no-admin cambie sus campos de
-- acceso. El service role (servidor, sin auth.uid()) y los admins pasan.
CREATE OR REPLACE FUNCTION protect_profile_access_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NULL OR is_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.permissions IS DISTINCT FROM OLD.permissions
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.position_id IS DISTINCT FROM OLD.position_id
     OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'No puedes cambiar rol, permisos, email o puesto de un perfil';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS protect_profile_access_fields ON profiles;
CREATE TRIGGER protect_profile_access_fields
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE PROCEDURE protect_profile_access_fields();
