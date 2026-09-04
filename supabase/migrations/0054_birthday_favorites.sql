-- Favoritos en la pestaña Cumpleaños ("marcar lo favorito... que suba
-- a una pestaña aparte") — los cumpleaños vienen de dos tablas
-- distintas (miembros de familia y contactos), así que la marca vive
-- en cada una por separado.

alter table family_members add column birthday_favorite boolean not null default false;
alter table contacts add column birthday_favorite boolean not null default false;
