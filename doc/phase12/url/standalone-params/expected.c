#include "runtime.h"
#include "std/url.h"

int main(void) {
    TSC_INIT();
    TscURLSearchParams p = tsc_search_params_parse(STR_LIT("a=1&b=2"));
    TscOptString _v_0 = tsc_search_params_get(&p, STR_LIT("a"));
    printf("%s\n", _v_0.has_value ? _v_0.value.data : "null");
    TscOptString _v_1 = tsc_search_params_get(&p, STR_LIT("b"));
    printf("%s\n", _v_1.has_value ? _v_1.value.data : "null");
    tsc_search_params_free(&p);
    return 0;
}
