#include "runtime.h"
#include "std/url.h"

int main(void) {
    TSC_INIT();
    TscURL u = tsc_url_parse(STR_LIT("https://example.com/path?foo=bar#section"));
    printf("%s\n", u.protocol.data);
    printf("%s\n", u.host.data);
    printf("%s\n", u.pathname.data);
    printf("%s\n", tsc_url_search(&u).data);
    printf("%s\n", u.hash.data);
    tsc_url_free(&u);
    return 0;
}
