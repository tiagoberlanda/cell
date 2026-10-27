-- Web Push: one VAPID key pair for the installation (private key encrypted with SECRET_KEY) and the devices that opted in.
CREATE TABLE push_keys(id int PRIMARY KEY DEFAULT 1 CHECK(id=1),public_key text NOT NULL,private_key text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE push_subscriptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),endpoint text UNIQUE NOT NULL,p256dh text NOT NULL,auth text NOT NULL,label text NOT NULL DEFAULT '',failures int NOT NULL DEFAULT 0,last_success_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
