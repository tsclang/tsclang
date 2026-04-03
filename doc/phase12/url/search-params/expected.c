#include "runtime.h"
#include "std/url.h"

int main(void) {
    TSC_INIT();
    TscURL u = tsc_url_parse(STR_LIT("https://example.com?foo=bar"));
    TscOptString _v_0 = tsc_search_params_get(&u.searchParams, STR_LIT("foo"));
    printf("%s\n", _v_0.has_value ? _v_0.value.data : "null");
    tsc_url_free(&u);
    return 0;
}
