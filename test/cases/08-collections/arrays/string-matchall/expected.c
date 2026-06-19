#include "runtime.h"
#include "std/regex.h"

typedef struct { Array_string *data; size_t length; size_t capacity; } Array_Array_string;

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("ab1cd2ef3");
    TscRegex r = tsc_regex_compile(STR_LIT("."));
    const Array_Array_string matches = tsc_regex_match_all(&r, s);
    printf("%zu\n", matches.length);
    printf("%s\n", matches.data[0].data[0].data);
    printf("%s\n", matches.data[1].data[0].data);
    tsc_regex_free(&r);
    tsc_string_release(s);
    return 0;
}
