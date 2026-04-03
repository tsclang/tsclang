#include "runtime.h"
#include "std/url.h"

int main(void) {
    TSC_INIT();
    TscURL u = tsc_url_parse(STR_LIT("https://example.com/?x=1&y=2"));
    TscURLParamIter _iter_0 = tsc_url_params_iter(&u);
    TscURLParam _p_0;
    while (tsc_url_params_next(&_iter_0, &_p_0)) {
        const String k = _p_0.key;
        const String v = _p_0.value;
        printf("%s\n", k.data);
    }
    tsc_url_free(&u);
    return 0;
}
