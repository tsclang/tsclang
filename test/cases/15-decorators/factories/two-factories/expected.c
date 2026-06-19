#include "runtime.h"

typedef struct { int _dummy; } Fmt;

static void Fmt_format_inner(const Fmt *self, String s) {
    (void)self;
    printf("%s\n", s.data);
}

static void Fmt_format_suffix(const Fmt *self, String v) {
    Fmt_format_inner(self, tsc_string_concat(v, STR_LIT("]")));
}

static void Fmt_format(const Fmt *self, String s) {
    Fmt_format_suffix(self, tsc_string_concat(STR_LIT("["), s));
}

int main(void) {
    TSC_INIT();
    Fmt f = {0};
    Fmt_format(&f, STR_LIT("hello"));
    return 0;
}
