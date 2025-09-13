-- Assign admin role to the current authenticated user
INSERT INTO public.user_roles (user_id, role) 
VALUES ('5d73de54-5b82-4353-905e-c8c4fb2f4d1b', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;