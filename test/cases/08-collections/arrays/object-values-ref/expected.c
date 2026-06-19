#include "runtime.h"

typedef struct { String first; String last; } Names;
typedef struct { String **data; size_t length; size_t capacity; } Array_ref_string;

static void Names_free(Names *self) {
    if (!self) return;
    tsc_string_release(self->first);
    tsc_string_release(self->last);
}

int main(void) {
    TSC_INIT();
    Names n = {0};
    { String _tsc_tmp = STR_LIT("Alice"); tsc_string_retain(_tsc_tmp); tsc_string_release(n.first); n.first = _tsc_tmp; }
    { String _tsc_tmp = STR_LIT("Smith"); tsc_string_retain(_tsc_tmp); tsc_string_release(n.last); n.last = _tsc_tmp; }
    {
        String *_vals_0_data[] = {&n.first, &n.last};
        Array_ref_string _vals_0 = {.data = _vals_0_data, .length = 2, .capacity = 2};
        const Array_ref_string vals = _vals_0;
        printf("%zu\n", vals.length);
    }
    printf("%s\n", n.first.data);
    Names_free(&n);
    return 0;
}
