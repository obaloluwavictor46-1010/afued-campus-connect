# Afued Campus Connect

Build a modern AFUED Community social app with React, Vite, Tailwind.



Connect to Supabase:

const supabaseUrl = "https://ciwljsccbheykclimmhq.supabase.co"

const supabaseKey = "sb_publishable_IhHGFJLuGGicCOYCKYLHqg_rKUwLNRH"

Use: import { createClient } from '@supabase/supabase-js'



TABLES (already exist):

- profiles: id (uuid FK auth.users), full_name text, email text, phone_number text, faculty text, avatar_url text

- posts: id uuid, user_id uuid, content text, image_url text, faculty_channel text, created_at timestamp

- comments: id uuid, post_id uuid, user_id uuid, content text, created_at

- marketplace_items: id uuid, seller_id uuid, title text, description text, price numeric, image_url text, created_at



REQUIREMENTS:

1. AUTH PAGE: Beautiful signup with Full Name, Email, Phone Number, Password, Faculty dropdown with 6 options:

- Faculty of Arts

- Faculty of Management and Social Science

- Faculty of Education

- Faculty of Science

- Faculty of Vocational and Technical Education

- Department of Educational Psychology and Counselling

On signup, do supabase.auth.signUp({email, password}) then insert into profiles table. Login with email/password. No matric number anywhere!



2. HOME FEED: Top tabs for 7 channels: All, plus the 6 faculties above. Filter posts by faculty_channel. Post composer with textarea + image upload to Supabase Storage bucket 'posts' + faculty selector. Display posts with profile avatar, name, faculty badge, time, content, image, like count, comment count. Real-time with supabase channel.



3. COMMENTS: Modal or page to view comments for a post and add comment.



4. MARKETPLACE: Grid of items with image, title, price. Add item button.



5. PROFILE: Show user info, edit button, my posts.



6. DESIGN: Modern, clean, mobile-first, blue primary #2563eb, white cards, rounded-2xl, Instagram-like.



Create full working app now. Use supabase client properly.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://afued-campus-connect.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/6d95c277-5be5-4806-98bd-e1d628cd67f7).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
Live deployment - 2026
