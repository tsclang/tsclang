#include "runtime.h"
#include "std/url.h"

int main(void) {
    TSC_INIT();
    TscURL u = tsc_url_parse(STR_LIT("https://example.com/?a=1&b=2"));
    tsc_url_params_delete(&u, STR_LIT("a"));
    printf("%s\n", tsc_url_search(&u).data);
    tsc_url_free(&u);
    return 0;
}
