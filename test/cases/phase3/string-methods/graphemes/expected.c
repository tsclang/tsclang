#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("hi");
    TscGraphemeIter _g_iter_0 = tsc_graphemes(s);
    String _g_0 = {0};
    while (tsc_graphemes_next(&_g_iter_0, &_g_0)) {
        const String g = _g_0;
        printf("%s\n", g.data);
    }
    tsc_string_release(s);
    return 0;
}
