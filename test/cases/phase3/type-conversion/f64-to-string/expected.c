#include "runtime.h"

int main(void) {
    TSC_INIT();
    const double x = 3.14;
    String _tmp_0 = tsc_f64_to_string(x);
    printf("%s\n", _tmp_0.data);
    tsc_string_release(_tmp_0);
    return 0;
}
