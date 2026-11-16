#include "runtime.h"

static double _fn_adapter_0_inc_f64(void *_env, double _a0);

double inc_f64(double x) {
    return x + 1;
}

double apply_fn_f64_f64_f64(tsc_closure f, double v) {
    return ((double (*)(void *, double))f.fn)(f.env, v);
}

static double _fn_adapter_0_inc_f64(void *_env, double _a0) {
    return inc_f64(_a0);
}

int main(void) {
    TSC_INIT();
    printf("%s\n", tsc_dtoa((double)(apply_fn_f64_f64_f64((tsc_closure){.env = NULL, .fn = (void*)_fn_adapter_0_inc_f64}, 41))));
    return 0;
}
