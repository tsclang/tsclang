#include "runtime.h"
#include "std/regex.h"

typedef struct { String *data; size_t length; size_t capacity; } Array_string;
typedef struct { bool has_value; Array_string value; } opt_Array_string;

int main(void) {
    TSC_INIT();
    TscRegex r = tsc_regex_compile(STR_LIT("(\\w+)"));
    opt_Array_string m = tsc_regex_match(&r, STR_LIT("hello"));
    if (m.has_value) {
        printf("%s\n", m.value.data[0].data);
    }
    tsc_regex_free(&r);
    return 0;
}
