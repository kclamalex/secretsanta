/** Every client-side URL in the app, so pages never build paths by hand. */
export const paths = {
  home: "/",
  join: (code: string) => `/s/${code}`,
  admin: (code: string) => `/admin/${code}`,
  test: (code?: string) => (code ? `/test/${code}` : "/test"),
};

export const absoluteUrl = (path: string) => `${window.location.origin}${path}`;
