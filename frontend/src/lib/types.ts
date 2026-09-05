export interface Game {
  id: number;
  igdb_id: number;
  title: string;
  cover_url: string | null;
  description: string | null;
  release_date: string | null;
  genres: string[];
  platforms: string[];
  igdb_rating: number | null;
  /** Enum `category` de IGDB (0 = juego principal, 1/2/4 = DLC, 3/13 = colección…). */
  category: number | null;
}

export type LibraryStatus = "playing" | "completed" | "backlog" | "wishlist" | "abandoned";

/** Origen de sincronización de una entrada de biblioteca ("" = añadida a mano). */
export type SyncSource = "steam" | "psn" | "";

export interface UserGame {
  id: number;
  game: Game;
  status: LibraryStatus;
  hours_played: number;
  completion_percentage: number;
  user_rating: number | null;
  review: string | null;
  platform: string;
  is_from_steam: boolean;
  sync_source: SyncSource;
  last_synced: string | null;
  added_at: string;
  updated_at: string;
}

export interface GameList {
  id: number;
  user?: { id: number; username: string } | null;
  name: string;
  description: string | null;
  cover_url: string | null;
  is_public: boolean;
  games: Game[];
  comments_count: number;
  likes_count: number;
  is_liked: boolean;
  created_at: string;
}

/** Versión ligera de una lista: la usan el carrusel y las publicaciones de lista. */
export interface GameListCard {
  id: number;
  user: { id: number; username: string; avatar_url: string | null } | null;
  name: string;
  cover_url: string | null;
  is_public: boolean;
  games_count: number;
  /** Hasta cuatro portadas, para el mosaico de la tarjeta. */
  preview_covers: string[];
  likes_count: number;
  is_liked: boolean;
}

export interface GameReview {
  id: number;
  user: { id: number; username: string; avatar_url: string | null };
  user_rating: number | null;
  review: string | null;
  comments_count: number;
  updated_at: string;
}

export interface PostUser {
  id: number;
  username: string;
  avatar_url: string | null;
}

export type PostType = "review" | "update" | "achievement" | "list" | "general";

export interface Post {
  id: number;
  user: PostUser;
  content: string;
  image_url: string | null;
  related_game: Game | null;
  /** Solo en las publicaciones de tipo "list". */
  related_list: GameListCard | null;
  post_type: PostType;
  likes_count: number;
  comments_count: number;
  is_liked: boolean;
  created_at: string;
}

/**
 * Forma común de un comentario, la compartan listas, reseñas o publicaciones.
 * Un solo nivel de respuestas (estilo YouTube): `parent` solo apunta a un
 * comentario de primer nivel, nunca a otra respuesta.
 */
export interface Comment {
  id: number;
  user: PostUser;
  content: string;
  parent: number | null;
  replies_count: number;
  created_at: string;
}

export type PostComment = Comment;

export interface PublicUser {
  id: number;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  is_following: boolean;
}

export interface PublicProfile {
  user: PublicUser;
  /** `null` cuando el perfil está bloqueado (privado y no eres el dueño). */
  stats: { total_games: number; completed_games: number; total_hours: number } | null;
  is_private: boolean;
}

interface GameBrief {
  title: string;
  hours: number;
  completion_pct: number;
  cover_url: string | null;
}

export interface Recommendation {
  igdb_id: number;
  title: string;
  cover_url: string | null;
  genres: string[];
  igdb_rating: number | null;
  category: number | null;
  score: number;
  reason: string;
}

export interface DashboardStats {
  total_games: number;
  completed_games: number;
  playing_games: number;
  backlog_games: number;
  wishlist_games: number;
  total_hours: number;
  completion_index: number;
  games_by_status: { playing: number; completed: number; backlog: number; abandoned: number };
  hours_by_genre: { genre: string; hours: number }[];
  /** Géneros con horas en total; hours_by_genre viene recortado con un "Otros". */
  genre_count: number;
  platform_distribution: { platform: string; count: number }[];
  playtime_over_time: { month: string; hours: number }[];
  top_games_by_completion: GameBrief[];
  top_games_by_hours: GameBrief[];
  recent_games: { title: string; status: string; hours: number; updated_at: string; cover_url: string | null }[];
}
